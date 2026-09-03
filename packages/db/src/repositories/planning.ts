import { and, desc, eq, gt, gte, inArray, isNull, like, or } from 'drizzle-orm';
import {
	forecastBalances,
	isRuleGeneratedOccurrence,
	rankSuggestedMatches,
	resolveOccurrence,
	createPlanSchema,
	matchMutationSchema,
	occurrenceRescheduleSchema,
	occurrenceVersionedMutationSchema,
	stopPlanSchema,
	updatePlanSchema,
	type PlannedTransaction
} from '@dukat/core/planning';
import { ZodError, type ZodType } from 'zod';
import { isoCalendarDateSchema } from '@dukat/core/ledger';
import type { FinancialDatabase } from '../connection';
import {
	financialAccount,
	ledgerAudit,
	ledgerCategory,
	ledgerTransaction,
	ledgerBalanceCorrection,
	mutationReceipt,
	plannedOccurrenceException,
	plannedOccurrenceMatch,
	plannedSeries,
	user,
	workspace,
	workspaceMembership
} from '../schema';

type Context = { userId: string; workspaceId: string };
export class PlanningError extends Error {
	constructor(
		public code: 'not_found' | 'conflict' | 'invalid',
		message: string
	) {
		super(message);
	}
}
const view = (p: typeof plannedSeries.$inferSelect) => ({
	id: p.id,
	rootPlanId: p.rootPlanId,
	workspaceId: p.workspaceId,
	accountId: p.accountId,
	kind: p.kind,
	amountMinor: p.amountMinor.toString(),
	date: p.date,
	effectiveFrom: p.effectiveFrom,
	status: p.status,
	description: p.description,
	categoryId: p.categoryId,
	cutoffDate: p.cutoffDate,
	cancelled: p.cancelled === 1,
	version: p.version,
	createdAt: p.createdAt.toISOString(),
	updatedAt: p.updatedAt.toISOString(),
	recurrence: p.recurrenceFrequency
		? {
				frequency: p.recurrenceFrequency,
				interval: p.recurrenceInterval!,
				...(p.recurrenceEndDate ? { endDate: p.recurrenceEndDate } : {})
			}
		: undefined
});
const json = (value: unknown) =>
	JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
const parse = <T>(schema: ZodType<T>, raw: unknown): T => {
	try {
		return schema.parse(raw);
	} catch (error) {
		if (error instanceof ZodError)
			throw new PlanningError('invalid', error.issues[0]?.message ?? 'Invalid input');
		throw error;
	}
};

export function createPlanningRepository(
	database: FinancialDatabase,
	clock: () => Date = () => new Date()
) {
	const idempotent = async <T>(
		tx: any,
		c: Context,
		operation: string,
		key: string,
		request: unknown,
		mutation: () => Promise<T>
	): Promise<T> => {
		const requestJson = json(request);
		const [receipt] = await tx
			.select({
				requestJson: mutationReceipt.requestJson,
				responseJson: mutationReceipt.responseJson
			})
			.from(mutationReceipt)
			.where(
				and(
					eq(mutationReceipt.workspaceId, c.workspaceId),
					eq(mutationReceipt.actorUserId, c.userId),
					eq(mutationReceipt.operation, operation),
					eq(mutationReceipt.idempotencyKey, key)
				)
			)
			.limit(1);
		if (receipt) {
			if (receipt.requestJson !== requestJson)
				throw new PlanningError(
					'conflict',
					'Idempotency key was already used for a different request'
				);
			return JSON.parse(receipt.responseJson) as T;
		}
		const result = await mutation();
		await tx.insert(mutationReceipt).values({
			id: crypto.randomUUID(),
			workspaceId: c.workspaceId,
			actorUserId: c.userId,
			operation,
			idempotencyKey: key,
			requestJson,
			responseJson: json(result)
		});
		return result;
	};
	const authorized = async (tx: any, c: Context) => {
		const [row] = await tx
			.select({ id: workspace.id })
			.from(workspace)
			.leftJoin(
				workspaceMembership,
				and(
					eq(workspaceMembership.workspaceId, workspace.id),
					eq(workspaceMembership.userId, c.userId)
				)
			)
			.where(
				and(
					eq(workspace.id, c.workspaceId),
					isNull(workspace.deletedAt),
					or(eq(workspace.personalOwnerUserId, c.userId), eq(workspaceMembership.userId, c.userId))
				)
			)
			.limit(1);
		if (!row) throw new PlanningError('not_found', 'Workspace not found');
	};
	const audit = async (
		tx: any,
		c: Context,
		entityType: 'plan' | 'plan_occurrence' | 'plan_match',
		entityId: string,
		action: string,
		before: unknown,
		after: unknown
	) => {
		const [actor] = await tx
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, c.userId));
		await tx.insert(ledgerAudit).values({
			id: crypto.randomUUID(),
			workspaceId: c.workspaceId,
			actorUserId: c.userId,
			actorDisplay: actor?.name || actor?.email || 'Unknown user',
			entityType,
			entityId,
			action,
			beforeJson: before == null ? null : json(before),
			afterJson: after == null ? null : json(after)
		});
	};
	const load = async (tx: any, c: Context, id: string) => {
		const [p] = await tx
			.select()
			.from(plannedSeries)
			.where(and(eq(plannedSeries.id, id), eq(plannedSeries.workspaceId, c.workspaceId)));
		if (!p) throw new PlanningError('not_found', 'Plan not found');
		return p;
	};
	const assertActiveAccount = async (tx: any, c: Context, accountId: string) => {
		const [account] = await tx
			.select({ id: financialAccount.id })
			.from(financialAccount)
			.where(
				and(
					eq(financialAccount.id, accountId),
					eq(financialAccount.workspaceId, c.workspaceId),
					isNull(financialAccount.archivedAt)
				)
			)
			.limit(1);
		if (!account) throw new PlanningError('conflict', 'Archived account plans cannot be changed');
	};
	const exceptions = async (tx: any, id: string) =>
		tx.select().from(plannedOccurrenceException).where(eq(plannedOccurrenceException.planId, id));
	const corePlan = async (
		tx: any,
		p: typeof plannedSeries.$inferSelect
	): Promise<PlannedTransaction> => ({
		id: p.id,
		accountId: p.accountId,
		kind: p.kind,
		amountMinor: p.amountMinor,
		date: p.date,
		effectiveFrom: p.effectiveFrom,
		status: p.status,
		active: true,
		cutoffDate: p.cutoffDate,
		cancelled: p.cancelled === 1,
		recurrence: p.recurrenceFrequency
			? {
					frequency: p.recurrenceFrequency,
					interval: p.recurrenceInterval!,
					endDate: p.recurrenceEndDate ?? undefined
				}
			: undefined,
		exceptions: (await exceptions(tx, p.id)).map((e: any) =>
			e.action === 'skip'
				? { originalDate: e.originalDate, action: 'skip' }
				: {
						originalDate: e.originalDate,
						action: 'change',
						date: e.changedDate ?? undefined,
						amountMinor: e.changedAmountMinor ?? undefined,
						status: e.changedStatus ?? undefined
					}
		)
	});
	return {
		async list(c: Context) {
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return (
					await tx.select().from(plannedSeries).where(eq(plannedSeries.workspaceId, c.workspaceId))
				).map(view);
			});
		},
		async create(c: Context, raw: any) {
			const input = parse(createPlanSchema, raw);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(tx, c, 'planning.create', input.idempotencyKey, input, async () => {
					const [a] = await tx
						.select()
						.from(financialAccount)
						.where(
							and(
								eq(financialAccount.id, input.accountId),
								eq(financialAccount.workspaceId, c.workspaceId),
								isNull(financialAccount.archivedAt)
							)
						);
					if (!a) throw new PlanningError('invalid', 'Account is missing or archived');
					if (input.categoryId) {
						const [category] = await tx
							.select({ archivedAt: ledgerCategory.archivedAt })
							.from(ledgerCategory)
							.where(
								and(
									eq(ledgerCategory.id, input.categoryId),
									eq(ledgerCategory.workspaceId, c.workspaceId)
								)
							);
						if (!category) throw new PlanningError('not_found', 'Category not found');
						if (category.archivedAt)
							throw new PlanningError('conflict', 'Archived categories cannot be selected');
					}
					const id = crypto.randomUUID();
					const row = {
						id,
						rootPlanId: id,
						workspaceId: c.workspaceId,
						accountId: input.accountId,
						kind: input.kind,
						amountMinor: BigInt(input.amountMinor),
						date: input.date,
						effectiveFrom: input.date,
						status: input.status,
						description: input.description,
						categoryId: input.categoryId,
						recurrenceFrequency: input.recurrence?.frequency,
						recurrenceInterval: input.recurrence?.interval,
						recurrenceEndDate: input.recurrence?.endDate
					};
					await tx.insert(plannedSeries).values(row);
					await tx
						.update(financialAccount)
						.set({ activityStartedAt: a.activityStartedAt ?? clock(), updatedAt: clock() })
						.where(eq(financialAccount.id, a.id));
					const created = view(await load(tx, c, row.id));
					await audit(tx, c, 'plan', id, 'created', null, created);
					return created;
				});
			});
		},
		async update(c: Context, id: string, raw: any) {
			const input = parse(updatePlanSchema, raw);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(tx, c, `planning.update:${id}`, input.idempotencyKey, input, async () => {
					const before = await load(tx, c, id);
					await assertActiveAccount(tx, c, before.accountId);
					if (before.version !== input.version)
						throw new PlanningError('conflict', 'Plan version conflict');
					if (before.cancelled || before.cutoffDate)
						throw new PlanningError('conflict', 'Inactive plans cannot be edited');
					if (input.categoryId) {
						const [category] = await tx
							.select({ archivedAt: ledgerCategory.archivedAt })
							.from(ledgerCategory)
							.where(
								and(
									eq(ledgerCategory.id, input.categoryId),
									eq(ledgerCategory.workspaceId, c.workspaceId)
								)
							);
						if (!category) throw new PlanningError('not_found', 'Category not found');
						if (category.archivedAt)
							throw new PlanningError('conflict', 'Archived categories cannot be selected');
					}
					if (before.recurrenceFrequency) {
						if (!input.effectiveFrom)
							throw new PlanningError('invalid', 'Recurring edits require effectiveFrom');
						const base = await corePlan(tx, before);
						if (!isRuleGeneratedOccurrence(base, input.effectiveFrom))
							throw new PlanningError(
								'invalid',
								'effectiveFrom is not generated by the recurrence rule'
							);
						if (input.effectiveFrom < before.effectiveFrom)
							throw new PlanningError('invalid', 'effectiveFrom must not precede this segment');
						if (input.date && input.date < input.effectiveFrom)
							throw new PlanningError('invalid', 'New plan date must not precede effectiveFrom');
						if (before.recurrenceEndDate && input.date && input.date > before.recurrenceEndDate)
							throw new PlanningError('invalid', 'Plan date must not follow recurrence end date');
						const futureExceptions = await tx
							.select({ id: plannedOccurrenceException.id })
							.from(plannedOccurrenceException)
							.where(
								and(
									eq(plannedOccurrenceException.planId, id),
									gte(plannedOccurrenceException.originalDate, input.effectiveFrom)
								)
							);
						const futureMatches = await tx
							.select({ id: plannedOccurrenceMatch.id })
							.from(plannedOccurrenceMatch)
							.where(
								and(
									eq(plannedOccurrenceMatch.planId, id),
									gte(plannedOccurrenceMatch.originalDate, input.effectiveFrom)
								)
							);
						const cadenceChanged = input.date !== undefined && input.date !== before.date;
						if (cadenceChanged && (futureExceptions.length || futureMatches.length))
							throw new PlanningError(
								'conflict',
								'Future exceptions or matches must be resolved before changing recurrence dates'
							);
						const changed = await tx
							.update(plannedSeries)
							.set({
								cutoffDate: input.effectiveFrom,
								version: before.version + 1,
								updatedAt: clock()
							})
							.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, input.version)))
							.returning({ id: plannedSeries.id });
						if (!changed.length) throw new PlanningError('conflict', 'Plan changed concurrently');
						const successorId = crypto.randomUUID();
						await tx.insert(plannedSeries).values({
							id: successorId,
							rootPlanId: before.rootPlanId,
							workspaceId: before.workspaceId,
							accountId: before.accountId,
							kind: before.kind,
							amountMinor: input.amountMinor ? BigInt(input.amountMinor) : before.amountMinor,
							date: input.date ?? before.date,
							effectiveFrom: input.effectiveFrom,
							status: input.status ?? before.status,
							description: input.description !== undefined ? input.description : before.description,
							categoryId: input.categoryId !== undefined ? input.categoryId : before.categoryId,
							recurrenceFrequency: before.recurrenceFrequency,
							recurrenceInterval: before.recurrenceInterval,
							recurrenceEndDate: before.recurrenceEndDate
						});
						if (!cadenceChanged) {
							await tx
								.update(plannedOccurrenceException)
								.set({ planId: successorId, updatedAt: clock() })
								.where(
									and(
										eq(plannedOccurrenceException.planId, id),
										gte(plannedOccurrenceException.originalDate, input.effectiveFrom)
									)
								);
							await tx
								.update(plannedOccurrenceMatch)
								.set({ planId: successorId })
								.where(
									and(
										eq(plannedOccurrenceMatch.planId, id),
										gte(plannedOccurrenceMatch.originalDate, input.effectiveFrom)
									)
								);
						}
						const after = view(await load(tx, c, successorId));
						await audit(tx, c, 'plan', successorId, 'split', view(before), after);
						return after;
					}
					if (input.effectiveFrom)
						throw new PlanningError('invalid', 'effectiveFrom is only valid for recurring plans');
					const updated = await tx
						.update(plannedSeries)
						.set({
							...(input.amountMinor ? { amountMinor: BigInt(input.amountMinor) } : {}),
							...(input.date ? { date: input.date } : {}),
							...(input.status ? { status: input.status } : {}),
							...(input.description !== undefined ? { description: input.description } : {}),
							...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
							version: before.version + 1,
							updatedAt: new Date()
						})
						.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, input.version)))
						.returning({ id: plannedSeries.id });
					if (!updated.length) throw new PlanningError('conflict', 'Plan changed concurrently');
					const after = view(await load(tx, c, id));
					await audit(tx, c, 'plan', id, 'updated', view(before), after);
					return after;
				});
			});
		},
		async occurrenceAction(
			c: Context,
			id: string,
			originalDate: string,
			action: 'skip' | 'restore' | 'reschedule',
			input: any = {}
		) {
			parse(isoCalendarDateSchema, originalDate);
			const parsed: any = parse(
				action === 'reschedule' ? occurrenceRescheduleSchema : occurrenceVersionedMutationSchema,
				input
			);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(
					tx,
					c,
					`planning.occurrence.${action}:${id}:${originalDate}`,
					parsed.idempotencyKey,
					parsed,
					async () => {
						const plan = await load(tx, c, id);
						await assertActiveAccount(tx, c, plan.accountId);
						if (plan.version !== parsed.version)
							throw new PlanningError('conflict', 'Plan version conflict');
						const existingMatch = await tx
							.select({ id: plannedOccurrenceMatch.id })
							.from(plannedOccurrenceMatch)
							.where(
								and(
									eq(plannedOccurrenceMatch.planId, id),
									eq(plannedOccurrenceMatch.originalDate, originalDate)
								)
							)
							.limit(1);
						if (existingMatch.length)
							throw new PlanningError('conflict', 'Matched occurrences cannot be changed');
						const base = await corePlan(tx, plan);
						if (!resolveOccurrence({ ...base, exceptions: [] }, originalDate))
							throw new PlanningError('not_found', 'Occurrence not found');
						if (action === 'restore')
							await tx
								.delete(plannedOccurrenceException)
								.where(
									and(
										eq(plannedOccurrenceException.planId, id),
										eq(plannedOccurrenceException.originalDate, originalDate)
									)
								);
						else
							await tx
								.insert(plannedOccurrenceException)
								.values({
									id: crypto.randomUUID(),
									workspaceId: c.workspaceId,
									planId: id,
									originalDate,
									action: action === 'skip' ? 'skip' : 'change',
									changedDate: parsed.date,
									changedAmountMinor: parsed.amountMinor ? BigInt(parsed.amountMinor) : null,
									changedStatus: parsed.status ?? null
								})
								.onConflictDoUpdate({
									target: [
										plannedOccurrenceException.planId,
										plannedOccurrenceException.originalDate
									],
									set: {
										action: action === 'skip' ? 'skip' : 'change',
										changedDate: parsed.date,
										changedAmountMinor: parsed.amountMinor ? BigInt(parsed.amountMinor) : null,
										changedStatus: parsed.status ?? null,
										updatedAt: new Date()
									}
								});
						const changed = await tx
							.update(plannedSeries)
							.set({ version: plan.version + 1, updatedAt: clock() })
							.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, parsed.version)))
							.returning({ version: plannedSeries.version });
						if (!changed.length) throw new PlanningError('conflict', 'Plan changed concurrently');
						await audit(tx, c, 'plan_occurrence', `${id}:${originalDate}`, action, null, parsed);
						return { ok: true, version: changed[0]!.version };
					}
				);
			});
		},
		async planAction(c: Context, id: string, action: 'cancel' | 'stop', input: unknown) {
			const parsed: any = parse(
				action === 'stop' ? stopPlanSchema : occurrenceVersionedMutationSchema,
				input
			);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(
					tx,
					c,
					`planning.plan.${action}:${id}`,
					parsed.idempotencyKey,
					parsed,
					async () => {
						const p = await load(tx, c, id);
						await assertActiveAccount(tx, c, p.accountId);
						if (p.version !== parsed.version)
							throw new PlanningError('conflict', 'Plan version conflict');
						if (action === 'cancel' && p.cancelled)
							throw new PlanningError('conflict', 'Plan is already cancelled');
						if (action === 'cancel' && p.cutoffDate)
							throw new PlanningError('conflict', 'Stopped plans cannot be cancelled');
						if (action === 'stop' && (!p.recurrenceFrequency || p.cancelled || p.cutoffDate))
							throw new PlanningError(
								'conflict',
								'Only active unstopped recurring plans can be stopped'
							);
						if (action === 'stop' && parsed.stopDate < p.effectiveFrom)
							throw new PlanningError('invalid', 'Stop date must not precede this segment');
						const changed = await tx
							.update(plannedSeries)
							.set({
								cutoffDate: action === 'stop' ? parsed.stopDate : p.cutoffDate,
								cancelled: action === 'cancel' ? 1 : p.cancelled,
								version: p.version + 1,
								updatedAt: clock()
							})
							.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, parsed.version)))
							.returning({ id: plannedSeries.id });
						if (!changed.length) throw new PlanningError('conflict', 'Plan changed concurrently');
						const after = view(await load(tx, c, id));
						await audit(tx, c, 'plan', id, action, view(p), after);
						return after;
					}
				);
			});
		},
		async suggestions(c: Context, id: string, originalDate: string) {
			parse(isoCalendarDateSchema, originalDate);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				const p = await load(tx, c, id);
				await assertActiveAccount(tx, c, p.accountId);
				const occurrence = resolveOccurrence(await corePlan(tx, p), originalDate);
				if (!occurrence) throw new PlanningError('not_found', 'Occurrence not found');
				const rows = await tx
					.select()
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.workspaceId, c.workspaceId),
							isNull(ledgerTransaction.trashedAt)
						)
					);
				const matched = await tx
					.select({ transactionId: plannedOccurrenceMatch.transactionId })
					.from(plannedOccurrenceMatch)
					.where(eq(plannedOccurrenceMatch.workspaceId, c.workspaceId));
				const matchedIds = new Set(matched.map((item) => item.transactionId));
				return rankSuggestedMatches(
					occurrence,
					rows
						.filter((row) => !matchedIds.has(row.id))
						.map((r: any) => ({
							id: r.id,
							accountId: r.accountId,
							kind: r.kind,
							amountMinor: r.amountMinor,
							date: r.date
						}))
				).map((x) => ({
					...x,
					transaction: { ...x.transaction, amountMinor: x.transaction.amountMinor.toString() }
				}));
			});
		},
		async match(
			c: Context,
			id: string,
			originalDate: string,
			input: { transactionId: string; version: number; idempotencyKey: string }
		) {
			parse(isoCalendarDateSchema, originalDate);
			const parsed = parse(matchMutationSchema, input);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(
					tx,
					c,
					`planning.match:${id}:${originalDate}`,
					parsed.idempotencyKey,
					parsed,
					async () => {
						const p = await load(tx, c, id);
						await assertActiveAccount(tx, c, p.accountId);
						if (p.version !== parsed.version)
							throw new PlanningError('conflict', 'Plan version conflict');
						const occurrence = resolveOccurrence(await corePlan(tx, p), originalDate);
						const [t] = await tx
							.select()
							.from(ledgerTransaction)
							.where(
								and(
									eq(ledgerTransaction.id, parsed.transactionId),
									eq(ledgerTransaction.workspaceId, c.workspaceId),
									isNull(ledgerTransaction.trashedAt)
								)
							);
						if (!occurrence || !t || t.accountId !== p.accountId || t.kind !== p.kind)
							throw new PlanningError('invalid', 'Transaction is not eligible');
						const existing = await tx
							.select({ id: plannedOccurrenceMatch.id })
							.from(plannedOccurrenceMatch)
							.where(
								or(
									and(
										eq(plannedOccurrenceMatch.planId, id),
										eq(plannedOccurrenceMatch.originalDate, originalDate)
									),
									eq(plannedOccurrenceMatch.transactionId, parsed.transactionId)
								)
							)
							.limit(1);
						if (existing.length)
							throw new PlanningError(
								'conflict',
								'Plan occurrence or transaction is already matched'
							);
						await tx.insert(plannedOccurrenceMatch).values({
							id: crypto.randomUUID(),
							workspaceId: c.workspaceId,
							planId: id,
							originalDate,
							transactionId: parsed.transactionId
						});
						const changed = await tx
							.update(plannedSeries)
							.set({ version: p.version + 1, updatedAt: clock() })
							.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, parsed.version)))
							.returning({ version: plannedSeries.version });
						if (!changed.length) throw new PlanningError('conflict', 'Plan changed concurrently');
						await audit(tx, c, 'plan_match', `${id}:${originalDate}`, 'matched', null, {
							transactionId: parsed.transactionId
						});
						return {
							matched: true,
							version: changed[0]!.version,
							amountMismatch: t.amountMinor !== occurrence.amountMinor,
							plannedAmountMinor: occurrence.amountMinor.toString(),
							transactionAmountMinor: t.amountMinor.toString()
						};
					}
				);
			});
		},
		async unmatch(
			c: Context,
			id: string,
			originalDate: string,
			input: { version: number; idempotencyKey: string }
		) {
			parse(isoCalendarDateSchema, originalDate);
			const parsed = parse(occurrenceVersionedMutationSchema, input);
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				return idempotent(
					tx,
					c,
					`planning.unmatch:${id}:${originalDate}`,
					parsed.idempotencyKey,
					parsed,
					async () => {
						const plan = await load(tx, c, id);
						if (plan.version !== parsed.version)
							throw new PlanningError('conflict', 'Plan version conflict');
						const deleted = await tx
							.delete(plannedOccurrenceMatch)
							.where(
								and(
									eq(plannedOccurrenceMatch.planId, id),
									eq(plannedOccurrenceMatch.originalDate, originalDate)
								)
							)
							.returning({ id: plannedOccurrenceMatch.id });
						if (!deleted.length) throw new PlanningError('not_found', 'Match not found');
						const changed = await tx
							.update(plannedSeries)
							.set({ version: plan.version + 1, updatedAt: clock() })
							.where(and(eq(plannedSeries.id, id), eq(plannedSeries.version, parsed.version)))
							.returning({ version: plannedSeries.version });
						if (!changed.length) throw new PlanningError('conflict', 'Plan changed concurrently');
						await audit(
							tx,
							c,
							'plan_match',
							`${id}:${originalDate}`,
							'unmatched',
							deleted[0],
							null
						);
						return { unmatched: true, version: changed[0]!.version };
					}
				);
			});
		},
		async accountForecast(c: Context, accountId: string, includeTentative = false) {
			const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(clock());
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				const [a] = await tx
					.select()
					.from(financialAccount)
					.where(
						and(eq(financialAccount.id, accountId), eq(financialAccount.workspaceId, c.workspaceId))
					);
				if (!a) throw new PlanningError('not_found', 'Account not found');
				const transactions = await tx
					.select()
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.accountId, accountId),
							isNull(ledgerTransaction.trashedAt),
							gt(ledgerTransaction.date, a.openingDate)
						)
					);
				const corrections = await tx
					.select()
					.from(ledgerBalanceCorrection)
					.where(
						and(
							eq(ledgerBalanceCorrection.accountId, accountId),
							isNull(ledgerBalanceCorrection.trashedAt),
							gt(ledgerBalanceCorrection.date, a.openingDate)
						)
					);
				const balance = corrections.reduce(
					(v: bigint, x) => v + BigInt(x.amountMinor),
					transactions.reduce(
						(v: bigint, t) => v + (t.kind === 'income' ? t.amountMinor : -t.amountMinor),
						a.openingBalanceMinor
					)
				);
				const ps = await tx
					.select()
					.from(plannedSeries)
					.where(
						and(
							eq(plannedSeries.workspaceId, c.workspaceId),
							eq(plannedSeries.accountId, accountId)
						)
					);
				const matches = await tx
					.select({
						planId: plannedOccurrenceMatch.planId,
						originalDate: plannedOccurrenceMatch.originalDate,
						transactionId: ledgerTransaction.id,
						transactionDate: ledgerTransaction.date,
						transactionAmountMinor: ledgerTransaction.amountMinor,
						transactionDescription: ledgerTransaction.description
					})
					.from(plannedOccurrenceMatch)
					.innerJoin(
						ledgerTransaction,
						and(
							eq(ledgerTransaction.id, plannedOccurrenceMatch.transactionId),
							isNull(ledgerTransaction.trashedAt)
						)
					)
					.where(eq(plannedOccurrenceMatch.workspaceId, c.workspaceId));
				const result = forecastBalances(
					[{ id: accountId, currentBalanceMinor: balance }],
					a.archivedAt ? [] : await Promise.all(ps.map((p) => corePlan(tx, p))),
					{
						today,
						includeTentative,
						matchedOccurrences: new Set(matches.map((m) => `${m.planId}:${m.originalDate}`))
					}
				)[0];
				const plansById = new Map(
					(await Promise.all(ps.map((p) => corePlan(tx, p)))).map((p) => [p.id, p])
				);
				const matchedOccurrences = matches.flatMap((match) => {
					const matchedPlan = plansById.get(match.planId);
					if (!matchedPlan) return [];
					const occurrence = resolveOccurrence(
						{ ...matchedPlan, active: true, cancelled: false, cutoffDate: null },
						match.originalDate
					);
					return occurrence
						? [
								{
									transaction: {
										id: match.transactionId,
										date: match.transactionDate,
										amountMinor: match.transactionAmountMinor.toString(),
										description: match.transactionDescription
									},
									occurrence: { ...occurrence, amountMinor: occurrence.amountMinor.toString() }
								}
							]
						: [];
				});
				return {
					...result,
					matchedOccurrences,
					currency: a.currency,
					currentBalanceMinor: result.currentBalanceMinor.toString(),
					startingBalanceMinor: result.startingBalanceMinor.toString(),
					endingBalanceMinor: result.endingBalanceMinor.toString(),
					occurrences: result.occurrences.map((o) => ({
						...o,
						amountMinor: o.amountMinor.toString()
					})),
					points: result.points.map((point) => ({
						...point,
						amountMinor: point.amountMinor.toString(),
						projectedBalanceMinor: point.projectedBalanceMinor.toString()
					}))
				};
			});
		},
		async history(c: Context, id: string) {
			return database.transaction(async (tx) => {
				await authorized(tx, c);
				const selected = await load(tx, c, id);
				const segments = await tx
					.select({ id: plannedSeries.id })
					.from(plannedSeries)
					.where(
						and(
							eq(plannedSeries.workspaceId, c.workspaceId),
							eq(plannedSeries.rootPlanId, selected.rootPlanId)
						)
					);
				const segmentIds = segments.map((segment) => segment.id);
				return tx
					.select()
					.from(ledgerAudit)
					.where(
						and(
							eq(ledgerAudit.workspaceId, c.workspaceId),
							or(
								and(eq(ledgerAudit.entityType, 'plan'), inArray(ledgerAudit.entityId, segmentIds)),
								and(
									or(
										eq(ledgerAudit.entityType, 'plan_occurrence'),
										eq(ledgerAudit.entityType, 'plan_match')
									),
									or(...segmentIds.map((segmentId) => like(ledgerAudit.entityId, `${segmentId}:%`)))
								)
							)
						)
					)
					.orderBy(desc(ledgerAudit.createdAt));
			});
		}
	};
}
export type PlanningRepository = ReturnType<typeof createPlanningRepository>;
