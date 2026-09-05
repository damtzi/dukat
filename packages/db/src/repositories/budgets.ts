import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { expandOccurrences } from '@dukat/core/planning';
import {
	budgetMonthSchema,
	createBudgetSchema,
	removeBudgetSchema,
	updateBudgetSchema
} from '@dukat/core/budgets';
import { ZodError, type ZodType } from 'zod';

import type { FinancialDatabase } from '../connection';
import {
	categoryBudget,
	financialAccount,
	householdExpense,
	ledgerAudit,
	ledgerCategory,
	ledgerTransaction,
	mutationReceipt,
	plannedOccurrenceException,
	plannedOccurrenceMatch,
	plannedSeries,
	user,
	workspace,
	workspaceMembership
} from '../schema';
import type { createExchangeRateRepository } from './exchange-rates';

type Context = { userId: string; workspaceId: string };
type Rates = Pick<ReturnType<typeof createExchangeRateRepository>, 'reportingTotals'>;

export class BudgetError extends Error {
	constructor(
		public code: 'not_found' | 'conflict' | 'invalid',
		message: string
	) {
		super(message);
	}
}

const json = (value: unknown) =>
	JSON.stringify(value, (_key, item) =>
		typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item
	);
const view = (row: typeof categoryBudget.$inferSelect) => ({
	id: row.id,
	workspaceId: row.workspaceId,
	categoryId: row.categoryId,
	month: row.month,
	amountMinor: row.amountMinor.toString(),
	reportingCurrency: row.reportingCurrency,
	version: row.version,
	createdAt: row.createdAt.toISOString(),
	updatedAt: row.updatedAt.toISOString()
});
const parse = <T>(schema: ZodType<T>, input: unknown): T => {
	try {
		return schema.parse(input);
	} catch (error) {
		if (error instanceof ZodError)
			throw new BudgetError('invalid', error.issues[0]?.message ?? 'Invalid input');
		throw error;
	}
};
const uniqueConstraint = (error: unknown): boolean =>
	error instanceof Error &&
	(/UNIQUE constraint failed/i.test(error.message) ||
		('cause' in error && uniqueConstraint((error as { cause?: unknown }).cause)));

export function createBudgetRepository(database: FinancialDatabase, rates: Rates) {
	type Tx = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];
	const authorize = async (tx: Tx, context: Context) => {
		const [found] = await tx
			.select({ id: workspace.id, reportingCurrency: workspace.reportingCurrency })
			.from(workspace)
			.leftJoin(
				workspaceMembership,
				and(
					eq(workspaceMembership.workspaceId, workspace.id),
					eq(workspaceMembership.userId, context.userId)
				)
			)
			.where(
				and(
					eq(workspace.id, context.workspaceId),
					isNull(workspace.deletedAt),
					or(
						eq(workspace.personalOwnerUserId, context.userId),
						eq(workspaceMembership.userId, context.userId)
					)
				)
			)
			.limit(1);
		if (!found) throw new BudgetError('not_found', 'Workspace not found');
		return found;
	};
	const audit = async (
		tx: Tx,
		context: Context,
		id: string,
		action: string,
		before: unknown,
		after: unknown
	) => {
		const [actor] = await tx
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, context.userId));
		await tx.insert(ledgerAudit).values({
			id: crypto.randomUUID(),
			workspaceId: context.workspaceId,
			actorUserId: context.userId,
			actorDisplay: actor?.name || actor?.email || 'Unknown user',
			entityType: 'budget',
			entityId: id,
			action,
			beforeJson: before == null ? null : json(before),
			afterJson: after == null ? null : json(after)
		});
	};
	const idempotent = async <T>(
		tx: Tx,
		context: Context,
		operation: string,
		key: string,
		request: unknown,
		run: () => Promise<T>
	): Promise<T> => {
		const requestJson = json(request);
		const [receipt] = await tx
			.select()
			.from(mutationReceipt)
			.where(
				and(
					eq(mutationReceipt.workspaceId, context.workspaceId),
					eq(mutationReceipt.actorUserId, context.userId),
					eq(mutationReceipt.operation, operation),
					eq(mutationReceipt.idempotencyKey, key)
				)
			)
			.limit(1);
		if (receipt) {
			if (receipt.requestJson !== requestJson)
				throw new BudgetError('conflict', 'Idempotency key was already used for another request');
			return JSON.parse(receipt.responseJson) as T;
		}
		const response = await run();
		await tx.insert(mutationReceipt).values({
			id: crypto.randomUUID(),
			workspaceId: context.workspaceId,
			actorUserId: context.userId,
			operation,
			idempotencyKey: key,
			requestJson,
			responseJson: json(response)
		});
		return response;
	};
	const load = async (tx: Tx, context: Context, id: string) => {
		const [budget] = await tx
			.select()
			.from(categoryBudget)
			.where(and(eq(categoryBudget.id, id), eq(categoryBudget.workspaceId, context.workspaceId)));
		if (!budget) throw new BudgetError('not_found', 'Budget not found');
		return budget;
	};

	return {
		create(context: Context, raw: unknown) {
			const input = parse(createBudgetSchema, raw);
			return database.transaction(async (tx) => {
				const ws = await authorize(tx, context);
				return idempotent(tx, context, 'budget.create', input.idempotencyKey, input, async () => {
					const [category] = await tx
						.select({ id: ledgerCategory.id, archivedAt: ledgerCategory.archivedAt })
						.from(ledgerCategory)
						.where(
							and(
								eq(ledgerCategory.workspaceId, context.workspaceId),
								eq(ledgerCategory.id, input.categoryId)
							)
						);
					if (!category) throw new BudgetError('not_found', 'Category not found');
					if (category.archivedAt)
						throw new BudgetError('conflict', 'Archived categories cannot have new budgets');
					const row = {
						id: crypto.randomUUID(),
						workspaceId: context.workspaceId,
						categoryId: input.categoryId,
						month: input.month,
						amountMinor: BigInt(input.amountMinor),
						reportingCurrency: ws.reportingCurrency ?? 'PLN'
					};
					try {
						await tx.insert(categoryBudget).values(row);
					} catch (error) {
						if (uniqueConstraint(error))
							throw new BudgetError('conflict', 'This category already has a budget for the month');
						throw error;
					}
					const created = view(await load(tx, context, row.id));
					await audit(tx, context, row.id, 'created', null, created);
					return created;
				});
			});
		},
		update(context: Context, id: string, raw: unknown) {
			const input = parse(updateBudgetSchema, raw);
			return database.transaction(async (tx) => {
				await authorize(tx, context);
				return idempotent(
					tx,
					context,
					`budget.update:${id}`,
					input.idempotencyKey,
					input,
					async () => {
						const before = await load(tx, context, id);
						if (before.version !== input.version)
							throw new BudgetError('conflict', 'Budget changed concurrently');
						const [changed] = await tx
							.update(categoryBudget)
							.set({
								amountMinor: BigInt(input.amountMinor),
								version: input.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(categoryBudget.id, id),
									eq(categoryBudget.workspaceId, context.workspaceId),
									eq(categoryBudget.version, input.version)
								)
							)
							.returning();
						if (!changed) throw new BudgetError('conflict', 'Budget changed concurrently');
						const result = view(changed);
						await audit(tx, context, id, 'updated', view(before), result);
						return result;
					}
				);
			});
		},
		remove(context: Context, id: string, raw: unknown) {
			const input = parse(removeBudgetSchema, raw);
			return database.transaction(async (tx) => {
				await authorize(tx, context);
				return idempotent(
					tx,
					context,
					`budget.remove:${id}`,
					input.idempotencyKey,
					input,
					async () => {
						const before = await load(tx, context, id);
						if (before.version !== input.version)
							throw new BudgetError('conflict', 'Budget changed concurrently');
						const removed = await tx
							.delete(categoryBudget)
							.where(
								and(
									eq(categoryBudget.id, id),
									eq(categoryBudget.workspaceId, context.workspaceId),
									eq(categoryBudget.version, input.version)
								)
							)
							.returning({ id: categoryBudget.id });
						if (!removed.length) throw new BudgetError('conflict', 'Budget changed concurrently');
						await audit(tx, context, id, 'removed', view(before), null);
						return { removed: true as const };
					}
				);
			});
		},
		async report(context: Context, rawMonth: string, includeTentative = false) {
			const month = parse(budgetMonthSchema, rawMonth);
			const data = await database.transaction(async (tx) => {
				await authorize(tx, context);
				const budgets = await tx
					.select({ budget: categoryBudget, categoryName: ledgerCategory.name })
					.from(categoryBudget)
					.innerJoin(ledgerCategory, eq(ledgerCategory.id, categoryBudget.categoryId))
					.where(
						and(
							eq(categoryBudget.workspaceId, context.workspaceId),
							eq(categoryBudget.month, month)
						)
					)
					.orderBy(asc(ledgerCategory.name));
				if (!budgets.length) return { budgets, entries: [] };
				const budgetCategoryIds = new Set(budgets.map(({ budget }) => budget.categoryId));
				const start = `${month}-01`;
				const [year, monthNumber] = month.split('-').map(Number);
				const end = new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10);
				const transactions = await tx
					.select({
						id: ledgerTransaction.id,
						categoryId: ledgerTransaction.categoryId,
						kind: ledgerTransaction.kind,
						amountMinor: ledgerTransaction.amountMinor,
						date: ledgerTransaction.date,
						currency: financialAccount.currency
					})
					.from(ledgerTransaction)
					.innerJoin(financialAccount, eq(financialAccount.id, ledgerTransaction.accountId))
					.where(
						and(
							eq(ledgerTransaction.workspaceId, context.workspaceId),
							eq(ledgerTransaction.source, 'manual'),
							isNull(ledgerTransaction.trashedAt),
							sql`${ledgerTransaction.date} >= ${start}`,
							sql`${ledgerTransaction.date} <= ${end}`,
							sql`not exists (select 1 from ${householdExpense} where ${householdExpense.sourceTransactionId} = ${ledgerTransaction.id})`
						)
					);
				const household = await tx
					.select({
						categoryId: householdExpense.categoryId,
						amountMinor: householdExpense.amountMinor,
						date: householdExpense.date,
						currency: householdExpense.currency
					})
					.from(householdExpense)
					.where(
						and(
							eq(householdExpense.workspaceId, context.workspaceId),
							isNull(householdExpense.trashedAt),
							sql`${householdExpense.date} >= ${start}`,
							sql`${householdExpense.date} <= ${end}`
						)
					);
				const plans = await tx
					.select({ plan: plannedSeries, currency: financialAccount.currency })
					.from(plannedSeries)
					.innerJoin(financialAccount, eq(financialAccount.id, plannedSeries.accountId))
					.where(eq(plannedSeries.workspaceId, context.workspaceId));
				const exceptions = await tx
					.select()
					.from(plannedOccurrenceException)
					.where(eq(plannedOccurrenceException.workspaceId, context.workspaceId));
				const matches = await tx
					.select({
						planId: plannedOccurrenceMatch.planId,
						originalDate: plannedOccurrenceMatch.originalDate
					})
					.from(plannedOccurrenceMatch)
					.innerJoin(
						ledgerTransaction,
						and(
							eq(ledgerTransaction.id, plannedOccurrenceMatch.transactionId),
							isNull(ledgerTransaction.trashedAt)
						)
					)
					.where(eq(plannedOccurrenceMatch.workspaceId, context.workspaceId));
				const matched = new Set(matches.map((item) => `${item.planId}:${item.originalDate}`));
				const entries = [
					...transactions.flatMap((item) =>
						item.categoryId && budgetCategoryIds.has(item.categoryId) && item.kind !== 'income'
							? [
									{
										group: `${item.categoryId}:completed`,
										amountMinor: (item.kind === 'refund'
											? -item.amountMinor
											: item.amountMinor
										).toString(),
										currency: item.currency,
										date: item.date
									}
								]
							: []
					),
					...household.flatMap((item) =>
						item.categoryId && budgetCategoryIds.has(item.categoryId)
							? [
									{
										group: `${item.categoryId}:completed`,
										amountMinor: item.amountMinor.toString(),
										currency: item.currency,
										date: item.date
									}
								]
							: []
					),
					...plans.flatMap(({ plan, currency }) => {
						if (
							!plan.categoryId ||
							!budgetCategoryIds.has(plan.categoryId) ||
							plan.kind !== 'expense'
						)
							return [];
						const planExceptions = exceptions
							.filter((item) => item.planId === plan.id)
							.map((item) =>
								item.action === 'skip'
									? { originalDate: item.originalDate, action: 'skip' as const }
									: {
											originalDate: item.originalDate,
											action: 'change' as const,
											date: item.changedDate ?? undefined,
											amountMinor: item.changedAmountMinor ?? undefined,
											status: item.changedStatus ?? undefined
										}
							);
						return expandOccurrences(
							{
								id: plan.id,
								accountId: plan.accountId,
								kind: plan.kind,
								amountMinor: plan.amountMinor,
								date: plan.date,
								effectiveFrom: plan.effectiveFrom,
								status: plan.status,
								active: true,
								cancelled: plan.cancelled === 1,
								cutoffDate: plan.cutoffDate,
								recurrence: plan.recurrenceFrequency
									? {
											frequency: plan.recurrenceFrequency,
											interval: plan.recurrenceInterval!,
											endDate: plan.recurrenceEndDate ?? undefined
										}
									: undefined,
								exceptions: planExceptions
							},
							start,
							end
						)
							.filter(
								(item) =>
									(item.status === 'expected' || includeTentative) &&
									!matched.has(`${item.planId}:${item.originalDate}`)
							)
							.map((item) => ({
								group: `${plan.categoryId}:expected`,
								amountMinor: item.amountMinor.toString(),
								currency,
								date: item.date
							}));
					})
				];
				return { budgets, entries };
			});
			const conversions = new Map<string, Awaited<ReturnType<Rates['reportingTotals']>>>();
			for (const { budget } of data.budgets)
				conversions.set(
					budget.id,
					await rates.reportingTotals(
						context.workspaceId,
						data.entries.filter(({ group }) => group.startsWith(`${budget.categoryId}:`)),
						budget.reportingCurrency
					)
				);
			return data.budgets.map(({ budget, categoryName }) => {
				const converted = conversions.get(budget.id)!;
				const totals = new Map(converted.totals.map((item) => [item.group, item.amountMinor]));
				const completedMinor = totals.get(`${budget.categoryId}:completed`) ?? '0';
				const expectedMinor = totals.get(`${budget.categoryId}:expected`) ?? '0';
				const remaining = BigInt(budget.amountMinor) - BigInt(completedMinor);
				const overspend =
					BigInt(completedMinor) + BigInt(expectedMinor) - BigInt(budget.amountMinor);
				return {
					...view(budget),
					categoryName,
					completedMinor: converted.missingRate ? '0' : completedMinor,
					expectedMinor: converted.missingRate ? '0' : expectedMinor,
					remainingMinor: converted.missingRate ? '0' : remaining.toString(),
					forecastOverspendMinor:
						converted.missingRate || overspend < 0n ? '0' : overspend.toString(),
					missingRate: converted.missingRate
				};
			});
		}
	};
}

export type BudgetRepository = ReturnType<typeof createBudgetRepository>;
