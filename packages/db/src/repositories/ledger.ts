import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, lt, or } from 'drizzle-orm';
import { supportedCurrencySchema } from '@dukat/core/exchange-rates';

import type { FinancialDatabase } from '../connection';
import {
	financialAccount,
	ledgerAudit,
	ledgerBalanceCheck,
	ledgerBalanceCorrection,
	ledgerCategory,
	ledgerTransfer,
	ledgerTransaction,
	mutationReceipt,
	plannedOccurrenceException,
	plannedOccurrenceMatch,
	plannedSeries,
	user,
	workspace,
	workspaceMembership
} from '../schema';

export type LedgerErrorCode = 'not_found' | 'conflict' | 'invalid';
export class LedgerError extends Error {
	constructor(
		public readonly code: LedgerErrorCode,
		message: string
	) {
		super(message);
		this.name = 'LedgerError';
	}
}

interface Context {
	userId: string;
	workspaceId: string;
}
interface Mutation {
	idempotencyKey: string;
}
interface VersionedMutation extends Mutation {
	version: number;
}
interface ArchiveAccount extends VersionedMutation {
	impactToken: string;
}
interface CreateAccount extends Mutation {
	name: string;
	type: 'current' | 'savings' | 'cash' | 'credit_card';
	currency: string;
	openingDate: string;
	openingBalanceMinor: string;
}
interface UpdateAccount extends CreateAccount {
	version: number;
}
interface CreateTransaction extends Mutation {
	kind: 'income' | 'expense';
	amountMinor: string;
	date: string;
	description?: string | null;
	categoryId?: string | null;
}
interface UpdateTransaction extends CreateTransaction {
	version: number;
}
interface CreateTransfer extends Mutation {
	fromAccountId: string;
	toAccountId: string;
	amountMinor: string;
	receivedAmountMinor?: string;
	date: string;
	description?: string | null;
}
interface UpdateTransfer extends Mutation {
	toAccountId: string;
	amountMinor: string;
	receivedAmountMinor?: string;
	date: string;
	description?: string | null;
	version: number;
}
interface CreateBalanceCheck extends Mutation {
	accountId: string;
	date: string;
	observedBalanceMinor: string;
}
interface UpdateBalanceCheck extends Mutation {
	date: string;
	observedBalanceMinor: string;
	version: number;
}
interface CreateBalanceCorrection extends Mutation {
	accountId: string;
	date: string;
	amountMinor: string;
	description?: string | null;
}
type FinancialTransaction = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const BALANCE_DIFFERENCE_MAX = (1n << 64n) - 1n;
const json = (value: unknown) =>
	JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
const parseMinor = (value: string) => {
	let amount: bigint;
	try {
		amount = BigInt(value);
	} catch {
		throw new LedgerError('invalid', 'Amount must be a canonical decimal integer string');
	}
	if (amount.toString() !== value)
		throw new LedgerError('invalid', 'Amount must be a canonical decimal integer string');
	if (amount < INT64_MIN || amount > INT64_MAX)
		throw new LedgerError('invalid', 'Amount is outside the signed 64-bit integer range');
	return amount;
};
const parsePositiveMinor = (value: string) => {
	const amount = parseMinor(value);
	if (amount <= 0n) throw new LedgerError('invalid', 'Transaction amount must be positive');
	return amount;
};
const parseCorrectionMinor = (value: string) => {
	let amount: bigint;
	try {
		amount = BigInt(value);
	} catch {
		throw new LedgerError('invalid', 'Amount must be a canonical decimal integer string');
	}
	if (amount.toString() !== value)
		throw new LedgerError('invalid', 'Amount must be a canonical decimal integer string');
	if (amount < -BALANCE_DIFFERENCE_MAX || amount > BALANCE_DIFFERENCE_MAX)
		throw new LedgerError('invalid', 'Amount is outside the balance difference range');
	if (amount === 0n) throw new LedgerError('invalid', 'Correction must be non-zero');
	return amount;
};
const checkedBalance = (value: bigint) => {
	if (value < INT64_MIN || value > INT64_MAX)
		throw new LedgerError('invalid', 'Balance exceeds the signed 64-bit integer range');
	return value;
};
const publicTransaction = (row: typeof ledgerTransaction.$inferSelect) => ({
	...row,
	amountMinor: row.amountMinor.toString()
});
const publicCorrection = (row: typeof ledgerBalanceCorrection.$inferSelect) => ({
	...row,
	amountMinor: row.amountMinor
});
const viewAccount = (account: typeof financialAccount.$inferSelect, balanceMinor: bigint) => ({
	...account,
	openingBalanceMinor: account.openingBalanceMinor.toString(),
	balanceMinor: balanceMinor.toString(),
	negativeBalance: balanceMinor < 0n,
	canDelete: account.archivedAt === null && account.activityStartedAt === null,
	canArchive:
		account.archivedAt === null && account.activityStartedAt !== null && balanceMinor === 0n,
	canRestore: account.archivedAt !== null
});

export function createLedgerRepository(rawDatabase: FinancialDatabase) {
	let transactionTail = Promise.resolve();
	const database = {
		async transaction<T>(operation: (tx: FinancialTransaction) => Promise<T>) {
			let release: () => void = () => undefined;
			const turn = new Promise<void>((resolve) => {
				release = resolve;
			});
			const previous = transactionTail;
			transactionTail = previous.then(() => turn);
			await previous;
			try {
				for (let attempt = 0; ; attempt += 1) {
					try {
						return await rawDatabase.transaction(operation);
					} catch (error) {
						const code =
							typeof error === 'object' && error !== null && 'code' in error
								? String(error.code)
								: '';
						const busy =
							code.includes('SQLITE_BUSY') ||
							(error instanceof Error && error.message.includes('database is locked'));
						if (!busy) throw error;
						if (attempt === 3) {
							throw new LedgerError('conflict', 'Database is busy; try the request again');
						}
						const maximumDelay = 25 * 2 ** attempt;
						await new Promise((resolve) =>
							setTimeout(resolve, maximumDelay / 2 + Math.random() * (maximumDelay / 2))
						);
					}
				}
			} finally {
				release();
			}
		}
	};
	type Transaction = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];
	async function validateSelectedCategory(
		tx: Transaction,
		workspaceId: string,
		categoryId: string | null | undefined,
		retainedCategoryId?: string | null
	) {
		if (!categoryId || categoryId === retainedCategoryId) return;
		const [category] = await tx
			.select({ archivedAt: ledgerCategory.archivedAt })
			.from(ledgerCategory)
			.where(and(eq(ledgerCategory.id, categoryId), eq(ledgerCategory.workspaceId, workspaceId)))
			.limit(1);
		if (!category) throw new LedgerError('not_found', 'Category not found');
		if (category.archivedAt)
			throw new LedgerError('conflict', 'Archived categories cannot be selected');
	}
	async function balance(
		workspaceId: string,
		accountId: string,
		openingDate: string,
		source: FinancialDatabase | Transaction = rawDatabase,
		throughDate?: string
	) {
		const rows = await source
			.select({ kind: ledgerTransaction.kind, amountMinor: ledgerTransaction.amountMinor })
			.from(ledgerTransaction)
			.where(
				and(
					eq(ledgerTransaction.workspaceId, workspaceId),
					eq(ledgerTransaction.accountId, accountId),
					isNull(ledgerTransaction.trashedAt),
					gt(ledgerTransaction.date, openingDate),
					throughDate ? lte(ledgerTransaction.date, throughDate) : undefined
				)
			);
		const transactionTotal = rows.reduce(
			(sum, row) => sum + (row.kind === 'income' ? row.amountMinor : -row.amountMinor),
			0n
		);
		const corrections = await source
			.select({ amountMinor: ledgerBalanceCorrection.amountMinor })
			.from(ledgerBalanceCorrection)
			.where(
				and(
					eq(ledgerBalanceCorrection.workspaceId, workspaceId),
					eq(ledgerBalanceCorrection.accountId, accountId),
					isNull(ledgerBalanceCorrection.trashedAt),
					gt(ledgerBalanceCorrection.date, openingDate),
					throughDate ? lte(ledgerBalanceCorrection.date, throughDate) : undefined
				)
			);
		return transactionTotal + corrections.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
	}
	async function accountView(
		account: typeof financialAccount.$inferSelect,
		source: FinancialDatabase | Transaction = rawDatabase
	) {
		return viewAccount(
			account,
			checkedBalance(
				account.openingBalanceMinor +
					(await balance(account.workspaceId, account.id, account.openingDate, source))
			)
		);
	}
	async function assertBalances(tx: Transaction, workspaceId: string, accountIds: string[]) {
		const accounts = await tx
			.select()
			.from(financialAccount)
			.where(
				and(
					eq(financialAccount.workspaceId, workspaceId),
					inArray(financialAccount.id, [...new Set(accountIds)])
				)
			);
		for (const account of accounts)
			checkedBalance(
				account.openingBalanceMinor +
					(await balance(workspaceId, account.id, account.openingDate, tx))
			);
	}
	async function canonicalTransferSides(
		tx: Transaction,
		transfer: typeof ledgerTransfer.$inferSelect
	) {
		const sides = await tx
			.select()
			.from(ledgerTransaction)
			.where(
				and(eq(ledgerTransaction.source, 'transfer'), eq(ledgerTransaction.transferId, transfer.id))
			);
		const from = sides.find((side) => side.transferSide === 'from');
		const to = sides.find((side) => side.transferSide === 'to');
		const matches = (side: typeof ledgerTransaction.$inferSelect, kind: string) =>
			side.source === 'transfer' &&
			side.kind === kind &&
			side.date === transfer.date &&
			side.description === transfer.description &&
			side.version === transfer.version &&
			Number(side.trashedAt) === Number(transfer.trashedAt);
		if (
			transfer.sentAmountMinor == null ||
			transfer.receivedAmountMinor == null ||
			transfer.sentAmountMinor <= 0n ||
			transfer.receivedAmountMinor <= 0n ||
			(from && transfer.sentAmountMinor !== from.amountMinor) ||
			(to && transfer.receivedAmountMinor !== to.amountMinor)
		)
			throw new LedgerError('conflict', 'Transfer aggregates are corrupt');
		if (from && to) {
			const accounts = await tx
				.select({ id: financialAccount.id, currency: financialAccount.currency })
				.from(financialAccount)
				.where(inArray(financialAccount.id, [from.accountId, to.accountId]));
			const fromCurrency = accounts.find((account) => account.id === from.accountId)?.currency;
			const toCurrency = accounts.find((account) => account.id === to.accountId)?.currency;
			if (fromCurrency === toCurrency && transfer.sentAmountMinor !== transfer.receivedAmountMinor)
				throw new LedgerError('conflict', 'Same-currency transfer aggregates are corrupt');
		}
		if (transfer.detachedAt) {
			if (
				sides.length !== 1 ||
				!matches(sides[0], sides[0].transferSide === 'from' ? 'expense' : 'income')
			)
				throw new LedgerError('conflict', 'Detached transfer is corrupt');
			return { from, to };
		}
		if (!from || !to || sides.length !== 2 || !matches(from, 'expense') || !matches(to, 'income'))
			throw new LedgerError('conflict', 'Transfer sides are corrupt or incomplete');
		return { from, to };
	}
	async function canAccess(tx: Transaction, userId: string, workspaceId: string) {
		try {
			await authorizedPersonal(tx, { userId, workspaceId });
			return true;
		} catch {
			return false;
		}
	}
	async function transferView(
		tx: Transaction,
		context: Context,
		transfer: typeof ledgerTransfer.$inferSelect,
		localAccountId?: string
	) {
		const sides = await canonicalTransferSides(tx, transfer);
		const local = [sides.from, sides.to].find((side) =>
			localAccountId
				? side?.workspaceId === context.workspaceId && side.accountId === localAccountId
				: side?.workspaceId === context.workspaceId
		);
		if (!local) throw new LedgerError('not_found', 'Transfer not found');
		const sentAmount = transfer.sentAmountMinor ?? sides.from?.amountMinor ?? null;
		const receivedAmount = transfer.receivedAmountMinor ?? sides.to?.amountMinor ?? null;
		const publicTransfer = {
			...transfer,
			trashedAt: transfer.trashedAt?.toISOString() ?? null,
			detachedAt: transfer.detachedAt?.toISOString() ?? null,
			createdAt: transfer.createdAt.toISOString(),
			updatedAt: transfer.updatedAt.toISOString()
		};
		const counterpart = local.transferSide === 'from' ? sides.to : sides.from;
		if (!counterpart)
			return {
				...publicTransfer,
				localSide: local.transferSide!,
				accountId: local.accountId,
				amountMinor: local.amountMinor.toString(),
				sentAmountMinor: local.transferSide === 'from' ? local.amountMinor.toString() : null,
				receivedAmountMinor: local.transferSide === 'to' ? local.amountMinor.toString() : null,
				canManage: false,
				counterparty: { visibility: 'deleted' as const }
			};
		const full = await canAccess(tx, context.userId, counterpart.workspaceId);
		const [account] = full
			? await tx
					.select()
					.from(financialAccount)
					.where(eq(financialAccount.id, counterpart.accountId))
					.limit(1)
			: [];
		return {
			...publicTransfer,
			localSide: local.transferSide!,
			accountId: local.accountId,
			amountMinor: local.amountMinor.toString(),
			sentAmountMinor: full
				? (sentAmount?.toString() ?? null)
				: local.transferSide === 'from'
					? local.amountMinor.toString()
					: null,
			receivedAmountMinor: full
				? (receivedAmount?.toString() ?? null)
				: local.transferSide === 'to'
					? local.amountMinor.toString()
					: null,
			canManage: full,
			counterparty:
				full && account
					? {
							visibility: 'full' as const,
							workspaceId: counterpart.workspaceId,
							accountId: counterpart.accountId,
							name: account.name
						}
					: { visibility: 'private' as const }
		};
	}
	// Despite the historical name, this is the common financial authorization boundary.
	// Household members and owners deliberately have identical ledger rights.
	async function authorizedPersonal(
		tx: Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0],
		context: Context
	) {
		const [found] = await tx
			.select({ id: workspace.id })
			.from(workspace)
			.where(
				and(
					eq(workspace.id, context.workspaceId),
					isNull(workspace.deletedAt),
					or(
						and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, context.userId)),
						and(
							eq(workspace.type, 'household'),
							inArray(
								workspace.id,
								tx
									.select({ id: workspaceMembership.workspaceId })
									.from(workspaceMembership)
									.where(eq(workspaceMembership.userId, context.userId))
							)
						)
					)
				)
			)
			.limit(1);
		if (!found) throw new LedgerError('not_found', 'Workspace not found');
	}
	async function idempotent<T>(
		tx: Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0],
		context: Context,
		operation: string,
		key: string,
		request: unknown,
		mutation: () => Promise<T>
	): Promise<T> {
		const requestJson = json(request);
		const [receipt] = await tx
			.select({
				requestJson: mutationReceipt.requestJson,
				responseJson: mutationReceipt.responseJson
			})
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
				throw new LedgerError(
					'conflict',
					'Idempotency key was already used for a different request'
				);
			return JSON.parse(receipt.responseJson) as T;
		}
		const result = await mutation();
		await tx.insert(mutationReceipt).values({
			id: crypto.randomUUID(),
			workspaceId: context.workspaceId,
			actorUserId: context.userId,
			operation,
			idempotencyKey: key,
			requestJson,
			responseJson: json(result)
		});
		return result;
	}
	async function transferIdempotent(
		tx: Transaction,
		context: Context,
		operation: string,
		key: string,
		request: unknown,
		mutation: () => Promise<string>
	) {
		const transferId = await idempotent(tx, context, operation, key, request, mutation);
		const [transfer] = await tx
			.select()
			.from(ledgerTransfer)
			.where(eq(ledgerTransfer.id, transferId));
		if (!transfer) throw new LedgerError('not_found', 'Transfer not found');
		const { from, to } = await canonicalTransferSides(tx, transfer);
		if (!from || !to || ![from.workspaceId, to.workspaceId].includes(context.workspaceId))
			throw new LedgerError('not_found', 'Transfer not found');
		if (
			!(await canAccess(tx, context.userId, from.workspaceId)) ||
			!(await canAccess(tx, context.userId, to.workspaceId))
		)
			throw new LedgerError('not_found', 'Transfer not found');
		return transferView(tx, context, transfer);
	}
	async function audit(
		tx: Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0],
		context: Context,
		entityType: 'account' | 'transaction' | 'transfer' | 'balance_check' | 'correction' | 'plan',
		entityId: string,
		action: string,
		before: unknown,
		after: unknown
	) {
		const [actor] = await tx
			.select({ name: user.name, email: user.email })
			.from(user)
			.where(eq(user.id, context.userId));
		await tx.insert(ledgerAudit).values({
			id: crypto.randomUUID(),
			workspaceId: context.workspaceId,
			actorUserId: context.userId,
			actorDisplay: actor?.name || actor?.email || context.userId,
			entityType,
			entityId,
			action,
			beforeJson: before == null ? null : json(before),
			afterJson: after == null ? null : json(after)
		});
	}
	const planAuditView = (plan: typeof plannedSeries.$inferSelect) => ({
		id: plan.id,
		rootPlanId: plan.rootPlanId,
		workspaceId: plan.workspaceId,
		accountId: plan.accountId,
		kind: plan.kind,
		amountMinor: plan.amountMinor.toString(),
		date: plan.date,
		effectiveFrom: plan.effectiveFrom,
		status: plan.status,
		description: plan.description,
		categoryId: plan.categoryId,
		cutoffDate: plan.cutoffDate,
		cancelled: plan.cancelled === 1,
		version: plan.version,
		createdAt: plan.createdAt.toISOString(),
		updatedAt: plan.updatedAt.toISOString(),
		recurrence: plan.recurrenceFrequency
			? {
					frequency: plan.recurrenceFrequency,
					interval: plan.recurrenceInterval!,
					...(plan.recurrenceEndDate ? { endDate: plan.recurrenceEndDate } : {})
				}
			: undefined
	});
	function archiveImpact(
		account: typeof financialAccount.$inferSelect,
		plans: (typeof plannedSeries.$inferSelect)[],
		date: string,
		matchedPlanIds: ReadonlySet<string>,
		skippedPlanIds: ReadonlySet<string>
	) {
		const affected = plans
			.flatMap((plan) => {
				const action = plan.recurrenceFrequency
					? !plan.cutoffDate || plan.cutoffDate > date
						? ('stop' as const)
						: undefined
					: plan.date >= date || (!matchedPlanIds.has(plan.id) && !skippedPlanIds.has(plan.id))
						? ('cancel' as const)
						: undefined;
				return action
					? [
							{
								id: plan.id,
								version: plan.version,
								action,
								kind: plan.kind,
								amountMinor: plan.amountMinor.toString(),
								date: plan.date,
								status: plan.status,
								description: plan.description,
								categoryId: plan.categoryId
							}
						]
					: [];
			})
			.sort((a, b) => a.id.localeCompare(b.id));
		const tokenPayload = {
			accountId: account.id,
			accountVersion: account.version,
			date,
			plans: affected.map(({ id, version, action }) => ({ id, version, action }))
		};
		return {
			accountVersion: account.version,
			date,
			plans: affected,
			impactToken: Buffer.from(JSON.stringify(tokenPayload)).toString('base64url')
		};
	}
	async function loadArchiveImpact(
		tx: Transaction,
		context: Context,
		accountId: string,
		date: string
	) {
		const [account] = await tx
			.select()
			.from(financialAccount)
			.where(
				and(
					eq(financialAccount.id, accountId),
					eq(financialAccount.workspaceId, context.workspaceId)
				)
			)
			.limit(1);
		if (!account) throw new LedgerError('not_found', 'Account not found');
		if (account.archivedAt) throw new LedgerError('conflict', 'Account is already archived');
		const plans = await tx
			.select()
			.from(plannedSeries)
			.where(
				and(
					eq(plannedSeries.workspaceId, context.workspaceId),
					eq(plannedSeries.accountId, accountId),
					eq(plannedSeries.cancelled, 0)
				)
			);
		const activeMatches = await tx
			.select({ planId: plannedOccurrenceMatch.planId })
			.from(plannedOccurrenceMatch)
			.innerJoin(
				ledgerTransaction,
				and(
					eq(ledgerTransaction.id, plannedOccurrenceMatch.transactionId),
					isNull(ledgerTransaction.trashedAt)
				)
			)
			.where(eq(plannedOccurrenceMatch.workspaceId, context.workspaceId));
		const skipped = await tx
			.select({ planId: plannedOccurrenceException.planId })
			.from(plannedOccurrenceException)
			.where(
				and(
					eq(plannedOccurrenceException.workspaceId, context.workspaceId),
					eq(plannedOccurrenceException.action, 'skip')
				)
			);
		return {
			account,
			impact: archiveImpact(
				account,
				plans,
				date,
				new Set(activeMatches.map((match) => match.planId)),
				new Set(skipped.map((exception) => exception.planId))
			)
		};
	}

	return {
		async listAccounts(context: Context) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				const rows = await tx
					.select()
					.from(financialAccount)
					.where(eq(financialAccount.workspaceId, context.workspaceId));
				return Promise.all(rows.map((account) => accountView(account, tx)));
			});
		},
		async createAccount(context: Context, input: CreateAccount) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(tx, context, 'account.create', input.idempotencyKey, input, async () => {
					const row: typeof financialAccount.$inferInsert = {
						id: crypto.randomUUID(),
						workspaceId: context.workspaceId,
						name: input.name,
						type: input.type,
						currency: input.currency,
						openingDate: input.openingDate,
						openingBalanceMinor: parseMinor(input.openingBalanceMinor)
					};
					await tx.insert(financialAccount).values(row);
					const [created] = await tx
						.select()
						.from(financialAccount)
						.where(eq(financialAccount.id, row.id));
					await audit(tx, context, 'account', created.id, 'opening_balance.created', null, {
						openingDate: created.openingDate,
						openingBalanceMinor: created.openingBalanceMinor,
						currency: created.currency
					});
					return viewAccount(created, checkedBalance(created.openingBalanceMinor));
				});
			});
		},
		async updateAccount(context: Context, accountId: string, input: UpdateAccount) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`account.update:${accountId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Account not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Account version is stale');
						if (
							before.currency !== input.currency &&
							!supportedCurrencySchema.safeParse(input.currency).success
						)
							throw new LedgerError(
								'invalid',
								'New account currency must be PLN or a current NBP Table A currency'
							);
						if (before.activityStartedAt && before.currency !== input.currency)
							throw new LedgerError(
								'conflict',
								'Account currency is immutable after activity exists'
							);
						if (
							before.archivedAt &&
							(before.openingDate !== input.openingDate ||
								before.openingBalanceMinor !== parseMinor(input.openingBalanceMinor))
						)
							throw new LedgerError('conflict', 'Archived account opening point is immutable');
						if (before.openingDate !== input.openingDate) {
							const [earlierSnapshot] = await tx
								.select({ id: ledgerBalanceCheck.id })
								.from(ledgerBalanceCheck)
								.where(
									and(
										eq(ledgerBalanceCheck.accountId, accountId),
										isNull(ledgerBalanceCheck.trashedAt),
										lt(ledgerBalanceCheck.date, input.openingDate)
									)
								)
								.limit(1);
							const [earlierCorrection] = await tx
								.select({ id: ledgerBalanceCorrection.id })
								.from(ledgerBalanceCorrection)
								.where(
									and(
										eq(ledgerBalanceCorrection.accountId, accountId),
										isNull(ledgerBalanceCorrection.trashedAt),
										lte(ledgerBalanceCorrection.date, input.openingDate)
									)
								)
								.limit(1);
							if (earlierSnapshot || earlierCorrection)
								throw new LedgerError(
									'conflict',
									'Account opening date cannot move past an active snapshot or correction'
								);
						}
						const updatedRows = await tx
							.update(financialAccount)
							.set({
								name: input.name,
								type: input.type,
								currency: input.currency,
								openingDate: input.openingDate,
								openingBalanceMinor: parseMinor(input.openingBalanceMinor),
								version: before.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(financialAccount.id, accountId),
									eq(financialAccount.workspaceId, context.workspaceId),
									eq(financialAccount.version, input.version),
									before.archivedAt
										? isNotNull(financialAccount.archivedAt)
										: isNull(financialAccount.archivedAt)
								)
							)
							.returning();
						const [after] = updatedRows;
						if (!after) throw new LedgerError('conflict', 'Account changed concurrently');
						if (
							before.openingDate !== after.openingDate ||
							before.openingBalanceMinor !== after.openingBalanceMinor
						)
							await audit(
								tx,
								context,
								'account',
								accountId,
								'opening_balance.updated',
								{
									openingDate: before.openingDate,
									openingBalanceMinor: before.openingBalanceMinor,
									currency: before.currency
								},
								{
									openingDate: after.openingDate,
									openingBalanceMinor: after.openingBalanceMinor,
									currency: after.currency
								}
							);
						if (
							before.name !== after.name ||
							before.type !== after.type ||
							before.currency !== after.currency
						)
							await audit(tx, context, 'account', accountId, 'updated', before, after);
						return accountView(after, tx);
					}
				);
			});
		},
		async accountArchiveImpact(context: Context, accountId: string) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return (
					await loadArchiveImpact(
						tx,
						context,
						accountId,
						new Intl.DateTimeFormat('en-CA', {
							timeZone: 'Europe/Warsaw'
						}).format(new Date())
					)
				).impact;
			});
		},
		async accountAction(
			context: Context,
			accountId: string,
			action: 'delete' | 'archive' | 'restore',
			input: VersionedMutation | ArchiveAccount
		) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`account.${action}:${accountId}`,
					input.idempotencyKey,
					input,
					async () => {
						const timestamp = new Date();
						const today = new Intl.DateTimeFormat('en-CA', {
							timeZone: 'Europe/Warsaw'
						}).format(timestamp);
						const loaded =
							action === 'archive'
								? await loadArchiveImpact(tx, context, accountId, today)
								: undefined;
						const [row] = loaded
							? [loaded.account]
							: await tx
									.select()
									.from(financialAccount)
									.where(
										and(
											eq(financialAccount.id, accountId),
											eq(financialAccount.workspaceId, context.workspaceId)
										)
									);
						if (!row) throw new LedgerError('not_found', 'Account not found');
						if (row.version !== input.version)
							throw new LedgerError('conflict', 'Account version is stale');
						if (
							action === 'archive' &&
							(!('impactToken' in input) || input.impactToken !== loaded!.impact.impactToken)
						)
							throw new LedgerError('conflict', 'Account archive impact changed');
						if (action === 'delete') {
							if (row.archivedAt || row.activityStartedAt)
								throw new LedgerError('conflict', 'Only unused active accounts can be deleted');
							const deleted = await tx
								.delete(financialAccount)
								.where(
									and(
										eq(financialAccount.id, accountId),
										eq(financialAccount.workspaceId, context.workspaceId),
										eq(financialAccount.version, input.version),
										isNull(financialAccount.archivedAt),
										isNull(financialAccount.activityStartedAt)
									)
								)
								.returning({ id: financialAccount.id });
							if (deleted.length !== 1)
								throw new LedgerError('conflict', 'Account changed concurrently');
							await audit(tx, context, 'account', accountId, 'deleted', row, null);
							return { deleted: true, negativeBalance: false };
						}
						const currentBalance = checkedBalance(
							row.openingBalanceMinor +
								(await balance(context.workspaceId, accountId, row.openingDate, tx))
						);
						if (action === 'archive' && row.archivedAt)
							throw new LedgerError('conflict', 'Account is already archived');
						if (action === 'restore' && !row.archivedAt)
							throw new LedgerError('conflict', 'Account is not archived');
						if (action === 'archive' && currentBalance !== 0n)
							throw new LedgerError('conflict', 'Account balance must be zero before archiving');
						if (action === 'archive' && !row.activityStartedAt)
							throw new LedgerError('conflict', 'Unused accounts should be deleted');
						const [updated] = await tx
							.update(financialAccount)
							.set({
								archivedAt: action === 'archive' ? timestamp : null,
								version: row.version + 1,
								updatedAt: timestamp
							})
							.where(
								and(
									eq(financialAccount.id, accountId),
									eq(financialAccount.workspaceId, context.workspaceId),
									eq(financialAccount.version, input.version),
									action === 'archive'
										? isNull(financialAccount.archivedAt)
										: isNotNull(financialAccount.archivedAt)
								)
							)
							.returning();
						if (!updated) throw new LedgerError('conflict', 'Account changed concurrently');
						const planningImpact = { stoppedRecurring: 0, cancelledOneTime: 0 };
						if (action === 'archive') {
							for (const impact of loaded!.impact.plans) {
								const [plan] = await tx
									.select()
									.from(plannedSeries)
									.where(
										and(
											eq(plannedSeries.workspaceId, context.workspaceId),
											eq(plannedSeries.id, impact.id),
											eq(plannedSeries.version, impact.version)
										)
									);
								if (!plan) throw new LedgerError('conflict', 'Plan changed concurrently');
								const changed = await tx
									.update(plannedSeries)
									.set({
										cutoffDate:
											impact.action === 'stop'
												? today > plan.effectiveFrom
													? today
													: plan.effectiveFrom
												: plan.cutoffDate,
										cancelled: impact.action === 'cancel' ? 1 : plan.cancelled,
										version: plan.version + 1,
										updatedAt: timestamp
									})
									.where(
										and(
											eq(plannedSeries.workspaceId, context.workspaceId),
											eq(plannedSeries.id, plan.id),
											eq(plannedSeries.version, plan.version)
										)
									)
									.returning();
								if (changed.length !== 1)
									throw new LedgerError('conflict', 'Plan changed concurrently');
								planningImpact[
									impact.action === 'stop' ? 'stoppedRecurring' : 'cancelledOneTime'
								]++;
								await audit(
									tx,
									context,
									'plan',
									plan.id,
									impact.action,
									planAuditView(plan),
									planAuditView(changed[0]!)
								);
							}
						}
						await audit(tx, context, 'account', accountId, action, row, updated);
						return { ...viewAccount(updated, currentBalance), planningImpact };
					}
				);
			});
		},
		async listTransactions(context: Context, accountId: string, includeTrashed = false) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				const rows = await tx
					.select()
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.workspaceId, context.workspaceId),
							eq(ledgerTransaction.accountId, accountId),
							eq(ledgerTransaction.source, 'manual'),
							includeTrashed ? undefined : isNull(ledgerTransaction.trashedAt)
						)
					);
				return rows.map(publicTransaction);
			});
		},
		async listTransfers(context: Context, accountId: string, includeTrashed = false) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				const local = await tx
					.select({ transferId: ledgerTransaction.transferId })
					.from(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.workspaceId, context.workspaceId),
							eq(ledgerTransaction.accountId, accountId),
							eq(ledgerTransaction.source, 'transfer')
						)
					);
				if (!local.length) return [];
				const rows = await tx
					.select()
					.from(ledgerTransfer)
					.where(
						and(
							inArray(
								ledgerTransfer.id,
								local.map((row) => row.transferId!)
							),
							includeTrashed ? undefined : isNull(ledgerTransfer.trashedAt)
						)
					);
				return Promise.all(rows.map((row) => transferView(tx, context, row, accountId)));
			});
		},
		async createTransaction(context: Context, accountId: string, input: CreateTransaction) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`transaction.create:${accountId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account) throw new LedgerError('not_found', 'Account not found');
						if (account.archivedAt)
							throw new LedgerError('conflict', 'Archived accounts do not accept transactions');
						await validateSelectedCategory(tx, context.workspaceId, input.categoryId);
						if (!account.activityStartedAt) {
							const marked = await tx
								.update(financialAccount)
								.set({ activityStartedAt: new Date() })
								.where(
									and(
										eq(financialAccount.id, accountId),
										eq(financialAccount.workspaceId, context.workspaceId),
										isNull(financialAccount.activityStartedAt),
										isNull(financialAccount.archivedAt)
									)
								)
								.returning({ id: financialAccount.id });
							if (marked.length !== 1)
								throw new LedgerError('conflict', 'Account changed concurrently');
						}
						const row: typeof ledgerTransaction.$inferInsert = {
							id: crypto.randomUUID(),
							workspaceId: context.workspaceId,
							accountId,
							kind: input.kind,
							amountMinor: parsePositiveMinor(input.amountMinor),
							date: input.date,
							description: input.description ?? null,
							categoryId: input.categoryId ?? null
						};
						await tx.insert(ledgerTransaction).values(row);
						const [created] = await tx
							.select()
							.from(ledgerTransaction)
							.where(eq(ledgerTransaction.id, row.id));
						await audit(tx, context, 'transaction', created.id, 'created', null, created);
						const amount = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, accountId, account.openingDate, tx))
						);
						return {
							transaction: publicTransaction(created),
							balanceMinor: amount.toString(),
							negativeBalance: amount < 0n
						};
					}
				);
			});
		},
		async createTransfer(context: Context, input: CreateTransfer) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return transferIdempotent(
					tx,
					context,
					'transfer.create',
					input.idempotencyKey,
					input,
					async () => {
						if (input.fromAccountId === input.toAccountId)
							throw new LedgerError('invalid', 'Transfer accounts must be different');
						const accounts = await tx
							.select()
							.from(financialAccount)
							.where(inArray(financialAccount.id, [input.fromAccountId, input.toAccountId]));
						const from = accounts.find((a) => a.id === input.fromAccountId),
							to = accounts.find((a) => a.id === input.toAccountId);
						if (!from || !to) throw new LedgerError('not_found', 'Transfer account not found');
						if (context.workspaceId !== from.workspaceId && context.workspaceId !== to.workspaceId)
							throw new LedgerError('not_found', 'Transfer account not found');
						if (
							!(await canAccess(tx, context.userId, from.workspaceId)) ||
							!(await canAccess(tx, context.userId, to.workspaceId))
						)
							throw new LedgerError('not_found', 'Transfer account not found');
						if (from.archivedAt || to.archivedAt)
							throw new LedgerError('conflict', 'Archived accounts do not accept transfers');
						if (from.currency !== to.currency && !input.receivedAmountMinor)
							throw new LedgerError(
								'invalid',
								'Cross-currency transfers require the exact received amount'
							);
						const id = crypto.randomUUID(),
							amount = parsePositiveMinor(input.amountMinor),
							receivedAmount = parsePositiveMinor(input.receivedAmountMinor ?? input.amountMinor),
							now = new Date();
						if (from.currency === to.currency && receivedAmount !== amount)
							throw new LedgerError('invalid', 'Same-currency transfer amounts must match');
						await tx.insert(ledgerTransfer).values({
							id,
							sentAmountMinor: amount,
							receivedAmountMinor: receivedAmount,
							date: input.date,
							description: input.description ?? null
						});
						await tx.insert(ledgerTransaction).values([
							{
								id: crypto.randomUUID(),
								workspaceId: from.workspaceId,
								accountId: from.id,
								kind: 'expense',
								amountMinor: amount,
								date: input.date,
								description: input.description ?? null,
								source: 'transfer',
								transferId: id,
								transferSide: 'from'
							},
							{
								id: crypto.randomUUID(),
								workspaceId: to.workspaceId,
								accountId: to.id,
								kind: 'income',
								amountMinor: receivedAmount,
								date: input.date,
								description: input.description ?? null,
								source: 'transfer',
								transferId: id,
								transferSide: 'to'
							}
						]);
						await tx
							.update(financialAccount)
							.set({ activityStartedAt: now })
							.where(
								and(
									inArray(financialAccount.id, [from.id, to.id]),
									isNull(financialAccount.activityStartedAt)
								)
							);
						const [created] = await tx
							.select()
							.from(ledgerTransfer)
							.where(eq(ledgerTransfer.id, id));
						for (const workspaceId of new Set([from.workspaceId, to.workspaceId]))
							await audit(tx, { ...context, workspaceId }, 'transfer', id, 'created', null, {
								id,
								side: workspaceId === from.workspaceId ? 'from' : 'to',
								counterparty:
									from.workspaceId === to.workspaceId
										? { accountId: workspaceId === from.workspaceId ? to.id : from.id }
										: { visibility: 'private' }
							});
						await assertBalances(tx, from.workspaceId, [from.id]);
						await assertBalances(tx, to.workspaceId, [to.id]);
						return created.id;
					}
				);
			});
		},
		async updateTransfer(context: Context, transferId: string, input: UpdateTransfer) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return transferIdempotent(
					tx,
					context,
					`transfer.update:${transferId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransfer)
							.where(eq(ledgerTransfer.id, transferId));
						if (!before) throw new LedgerError('not_found', 'Transfer not found');
						if (before.detachedAt)
							throw new LedgerError('conflict', 'Detached transfers are immutable');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transfer version is stale');
						if (before.trashedAt)
							throw new LedgerError('conflict', 'Trashed transfers cannot be edited');
						const { from, to: oldTo } = await canonicalTransferSides(tx, before);
						if (
							!from ||
							!oldTo ||
							!(await canAccess(tx, context.userId, from.workspaceId)) ||
							!(await canAccess(tx, context.userId, oldTo.workspaceId)) ||
							![from.workspaceId, oldTo.workspaceId].includes(context.workspaceId)
						)
							throw new LedgerError('not_found', 'Transfer not found');
						if (input.toAccountId === from.accountId)
							throw new LedgerError('invalid', 'Transfer accounts must be different');
						const [to] = await tx
							.select()
							.from(financialAccount)
							.where(eq(financialAccount.id, input.toAccountId));
						const [fromAccount] = await tx
							.select()
							.from(financialAccount)
							.where(eq(financialAccount.id, from.accountId));
						if (!to || !fromAccount || !(await canAccess(tx, context.userId, to.workspaceId)))
							throw new LedgerError('not_found', 'Transfer account not found');
						if (to.archivedAt || fromAccount.archivedAt)
							throw new LedgerError('conflict', 'Archived accounts do not allow transfer changes');
						if (to.currency !== fromAccount.currency && !input.receivedAmountMinor)
							throw new LedgerError(
								'invalid',
								'Cross-currency transfers require the exact received amount'
							);
						const amount = parsePositiveMinor(input.amountMinor),
							receivedAmount = parsePositiveMinor(input.receivedAmountMinor ?? input.amountMinor),
							now = new Date();
						if (to.currency === fromAccount.currency && receivedAmount !== amount)
							throw new LedgerError('invalid', 'Same-currency transfer amounts must match');
						const updatedAggregates = await tx
							.update(ledgerTransfer)
							.set({
								sentAmountMinor: amount,
								receivedAmountMinor: receivedAmount,
								date: input.date,
								description: input.description ?? null,
								version: before.version + 1,
								updatedAt: now
							})
							.where(
								and(
									eq(ledgerTransfer.id, transferId),
									eq(ledgerTransfer.version, input.version),
									isNull(ledgerTransfer.trashedAt)
								)
							)
							.returning();
						if (updatedAggregates.length !== 1)
							throw new LedgerError('conflict', 'Transfer changed concurrently');
						const [after] = updatedAggregates;
						const updatedSides = await tx
							.update(ledgerTransaction)
							.set({
								amountMinor: amount,
								date: input.date,
								description: input.description ?? null,
								version: before.version + 1,
								updatedAt: now
							})
							.where(
								and(
									eq(ledgerTransaction.transferId, transferId),
									eq(ledgerTransaction.version, input.version)
								)
							)
							.returning({ id: ledgerTransaction.id });
						if (updatedSides.length !== 2)
							throw new LedgerError('conflict', 'Transfer sides changed concurrently');
						await tx
							.update(ledgerTransaction)
							.set({ amountMinor: receivedAmount })
							.where(
								and(
									eq(ledgerTransaction.transferId, transferId),
									eq(ledgerTransaction.transferSide, 'to')
								)
							);
						const movedSide = await tx
							.update(ledgerTransaction)
							.set({ accountId: to.id, workspaceId: to.workspaceId })
							.where(
								and(
									eq(ledgerTransaction.transferId, transferId),
									eq(ledgerTransaction.transferSide, 'to')
								)
							)
							.returning({ id: ledgerTransaction.id });
						if (movedSide.length !== 1)
							throw new LedgerError('conflict', 'Transfer destination side changed concurrently');
						await tx
							.update(financialAccount)
							.set({ activityStartedAt: now })
							.where(
								and(
									eq(financialAccount.id, to.id),
									eq(financialAccount.workspaceId, to.workspaceId),
									isNull(financialAccount.activityStartedAt)
								)
							);
						await assertBalances(tx, from.workspaceId, [from.accountId]);
						await assertBalances(tx, oldTo.workspaceId, [oldTo.accountId]);
						await assertBalances(tx, to.workspaceId, [to.id]);
						for (const workspaceId of new Set([
							from.workspaceId,
							oldTo.workspaceId,
							to.workspaceId
						]))
							await audit(
								tx,
								{ ...context, workspaceId },
								'transfer',
								transferId,
								'updated',
								{ id: transferId },
								{ id: transferId }
							);
						return after.id;
					}
				);
			});
		},
		async transferAction(
			context: Context,
			transferId: string,
			action: 'trash' | 'restore',
			input: VersionedMutation
		) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return transferIdempotent(
					tx,
					context,
					`transfer.${action}:${transferId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransfer)
							.where(eq(ledgerTransfer.id, transferId));
						if (!before) throw new LedgerError('not_found', 'Transfer not found');
						if (before.detachedAt)
							throw new LedgerError('conflict', 'Detached transfers are immutable');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transfer version is stale');
						if ((action === 'trash') === !!before.trashedAt)
							throw new LedgerError(
								'conflict',
								`Transfer is ${action === 'trash' ? 'already trashed' : 'not trashed'}`
							);
						const { from, to } = await canonicalTransferSides(tx, before);
						if (
							!from ||
							!to ||
							!(await canAccess(tx, context.userId, from.workspaceId)) ||
							!(await canAccess(tx, context.userId, to.workspaceId)) ||
							![from.workspaceId, to.workspaceId].includes(context.workspaceId)
						)
							throw new LedgerError('not_found', 'Transfer not found');
						const accounts = await tx
							.select()
							.from(financialAccount)
							.where(inArray(financialAccount.id, [from.accountId, to.accountId]));
						if (
							accounts.some(
								(a) => (a.id === from.accountId || a.id === to.accountId) && a.archivedAt
							)
						)
							throw new LedgerError('conflict', 'Archived accounts do not allow transfer changes');
						const now = new Date();
						const updatedAggregates = await tx
							.update(ledgerTransfer)
							.set({
								trashedAt: action === 'trash' ? now : null,
								version: before.version + 1,
								updatedAt: now
							})
							.where(
								and(
									eq(ledgerTransfer.id, transferId),
									eq(ledgerTransfer.version, input.version),
									action === 'trash'
										? isNull(ledgerTransfer.trashedAt)
										: isNotNull(ledgerTransfer.trashedAt)
								)
							)
							.returning();
						if (updatedAggregates.length !== 1)
							throw new LedgerError('conflict', 'Transfer changed concurrently');
						const [after] = updatedAggregates;
						const updatedSides = await tx
							.update(ledgerTransaction)
							.set({
								trashedAt: action === 'trash' ? now : null,
								version: before.version + 1,
								updatedAt: now
							})
							.where(
								and(
									eq(ledgerTransaction.transferId, transferId),
									eq(ledgerTransaction.version, input.version),
									action === 'trash'
										? isNull(ledgerTransaction.trashedAt)
										: isNotNull(ledgerTransaction.trashedAt)
								)
							)
							.returning({ id: ledgerTransaction.id });
						if (updatedSides.length !== 2)
							throw new LedgerError('conflict', 'Transfer sides changed concurrently');
						await assertBalances(tx, from.workspaceId, [from.accountId]);
						await assertBalances(tx, to.workspaceId, [to.accountId]);
						for (const workspaceId of new Set([from.workspaceId, to.workspaceId]))
							await audit(
								tx,
								{ ...context, workspaceId },
								'transfer',
								transferId,
								action,
								{ id: transferId },
								{ id: transferId }
							);
						return after.id;
					}
				);
			});
		},
		async createBalanceCheck(context: Context, input: CreateBalanceCheck) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					'balance_check.create',
					input.idempotencyKey,
					input,
					async () => {
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, input.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account) throw new LedgerError('not_found', 'Account not found');
						if (account.archivedAt)
							throw new LedgerError(
								'conflict',
								'Archived accounts do not accept balance snapshots'
							);
						if (input.date < account.openingDate)
							throw new LedgerError(
								'invalid',
								'Balance snapshot cannot predate the account opening'
							);
						const observed = parseMinor(input.observedBalanceMinor);
						const calculated = checkedBalance(
							account.openingBalanceMinor +
								(await balance(
									context.workspaceId,
									account.id,
									account.openingDate,
									tx,
									input.date
								))
						);
						const id = crypto.randomUUID();
						await tx.insert(ledgerBalanceCheck).values({
							id,
							workspaceId: context.workspaceId,
							accountId: account.id,
							date: input.date,
							observedBalanceMinor: observed
						});
						await tx
							.update(financialAccount)
							.set({ activityStartedAt: new Date() })
							.where(
								and(eq(financialAccount.id, account.id), isNull(financialAccount.activityStartedAt))
							);
						const [row] = await tx
							.select()
							.from(ledgerBalanceCheck)
							.where(eq(ledgerBalanceCheck.id, id));
						await audit(tx, context, 'balance_check', id, 'created', null, row);
						return {
							...row,
							observedBalanceMinor: observed.toString(),
							calculatedBalanceMinor: calculated.toString(),
							differenceMinor: (observed - calculated).toString()
						};
					}
				);
			});
		},
		async listBalanceChecks(context: Context, accountId: string, includeTrashed = false) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				const [account] = await tx
					.select()
					.from(financialAccount)
					.where(
						and(
							eq(financialAccount.id, accountId),
							eq(financialAccount.workspaceId, context.workspaceId)
						)
					);
				if (!account) throw new LedgerError('not_found', 'Account not found');
				const rows = await tx
					.select()
					.from(ledgerBalanceCheck)
					.where(
						and(
							eq(ledgerBalanceCheck.workspaceId, context.workspaceId),
							eq(ledgerBalanceCheck.accountId, accountId),
							includeTrashed ? undefined : isNull(ledgerBalanceCheck.trashedAt)
						)
					);
				return Promise.all(
					rows.map(async (row) => {
						const calculated = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, accountId, account.openingDate, tx, row.date))
						);
						return {
							...row,
							observedBalanceMinor: row.observedBalanceMinor.toString(),
							calculatedBalanceMinor: calculated.toString(),
							differenceMinor: (row.observedBalanceMinor - calculated).toString()
						};
					})
				);
			});
		},
		async listBalanceCorrections(context: Context, accountId: string, includeTrashed = false) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				const [account] = await tx
					.select({ id: financialAccount.id })
					.from(financialAccount)
					.where(
						and(
							eq(financialAccount.id, accountId),
							eq(financialAccount.workspaceId, context.workspaceId)
						)
					);
				if (!account) throw new LedgerError('not_found', 'Account not found');
				const rows = await tx
					.select()
					.from(ledgerBalanceCorrection)
					.where(
						and(
							eq(ledgerBalanceCorrection.workspaceId, context.workspaceId),
							eq(ledgerBalanceCorrection.accountId, accountId),
							includeTrashed ? undefined : isNull(ledgerBalanceCorrection.trashedAt)
						)
					);
				return rows.map(publicCorrection);
			});
		},
		async updateBalanceCheck(context: Context, checkId: string, input: UpdateBalanceCheck) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`balance_check.update:${checkId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerBalanceCheck)
							.where(
								and(
									eq(ledgerBalanceCheck.id, checkId),
									eq(ledgerBalanceCheck.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Balance snapshot not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Balance snapshot version is stale');
						if (before.trashedAt)
							throw new LedgerError('conflict', 'Trashed balance snapshots cannot be edited');
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, before.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account) throw new LedgerError('not_found', 'Account not found');
						if (account.archivedAt)
							throw new LedgerError(
								'conflict',
								'Archived accounts do not allow balance snapshot changes'
							);
						if (input.date < account.openingDate)
							throw new LedgerError(
								'invalid',
								'Balance snapshot cannot predate the account opening'
							);
						const observed = parseMinor(input.observedBalanceMinor);
						const [after] = await tx
							.update(ledgerBalanceCheck)
							.set({
								date: input.date,
								observedBalanceMinor: observed,
								version: before.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(ledgerBalanceCheck.id, checkId),
									eq(ledgerBalanceCheck.workspaceId, context.workspaceId),
									eq(ledgerBalanceCheck.version, input.version),
									isNull(ledgerBalanceCheck.trashedAt)
								)
							)
							.returning();
						if (!after) throw new LedgerError('conflict', 'Balance snapshot changed concurrently');
						const calculated = checkedBalance(
							account.openingBalanceMinor +
								(await balance(
									context.workspaceId,
									account.id,
									account.openingDate,
									tx,
									input.date
								))
						);
						await audit(tx, context, 'balance_check', checkId, 'updated', before, after);
						return {
							...after,
							observedBalanceMinor: observed.toString(),
							calculatedBalanceMinor: calculated.toString(),
							differenceMinor: (observed - calculated).toString()
						};
					}
				);
			});
		},
		async createBalanceCorrection(context: Context, input: CreateBalanceCorrection) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					'correction.create',
					input.idempotencyKey,
					input,
					async () => {
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, input.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account) throw new LedgerError('not_found', 'Account not found');
						if (account.archivedAt)
							throw new LedgerError('conflict', 'Archived accounts do not accept corrections');
						if (input.date <= account.openingDate)
							throw new LedgerError(
								'invalid',
								'Balance correction must follow the account opening date'
							);
						const amount = parseCorrectionMinor(input.amountMinor);
						const id = crypto.randomUUID();
						await tx.insert(ledgerBalanceCorrection).values({
							id,
							workspaceId: context.workspaceId,
							accountId: account.id,
							date: input.date,
							amountMinor: amount.toString(),
							description: input.description ?? null
						});
						await tx
							.update(financialAccount)
							.set({ activityStartedAt: new Date() })
							.where(
								and(eq(financialAccount.id, account.id), isNull(financialAccount.activityStartedAt))
							);
						const [row] = await tx
							.select()
							.from(ledgerBalanceCorrection)
							.where(eq(ledgerBalanceCorrection.id, id));
						await audit(tx, context, 'correction', id, 'created', null, row);
						await assertBalances(tx, context.workspaceId, [account.id]);
						return publicCorrection(row);
					}
				);
			});
		},
		async reconciliationAction(
			context: Context,
			entityType: 'balance_check' | 'correction',
			entityId: string,
			action: 'trash' | 'restore',
			input: VersionedMutation
		) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`${entityType}.${action}:${entityId}`,
					input.idempotencyKey,
					input,
					async () => {
						const table =
							entityType === 'balance_check' ? ledgerBalanceCheck : ledgerBalanceCorrection;
						const [before] = await tx
							.select()
							.from(table)
							.where(and(eq(table.id, entityId), eq(table.workspaceId, context.workspaceId)));
						if (!before) throw new LedgerError('not_found', 'Reconciliation record not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Reconciliation version is stale');
						if ((action === 'trash') === !!before.trashedAt)
							throw new LedgerError(
								'conflict',
								`Record is ${action === 'trash' ? 'already trashed' : 'not trashed'}`
							);
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, before.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account) throw new LedgerError('not_found', 'Account not found');
						if (account.archivedAt)
							throw new LedgerError(
								'conflict',
								'Archived accounts do not allow reconciliation changes'
							);
						const updated = await tx
							.update(table)
							.set({
								trashedAt: action === 'trash' ? new Date() : null,
								version: before.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(table.id, entityId),
									eq(table.workspaceId, context.workspaceId),
									eq(table.version, input.version),
									action === 'trash' ? isNull(table.trashedAt) : isNotNull(table.trashedAt)
								)
							)
							.returning();
						if (updated.length !== 1)
							throw new LedgerError('conflict', 'Reconciliation record changed concurrently');
						const [after] = updated;
						if (entityType === 'correction')
							await assertBalances(tx, context.workspaceId, [before.accountId]);
						await audit(tx, context, entityType, entityId, action, before, after);
						return {
							...after,
							...(entityType === 'balance_check'
								? {
										observedBalanceMinor: (
											after as typeof ledgerBalanceCheck.$inferSelect
										).observedBalanceMinor.toString()
									}
								: {
										amountMinor: (after as typeof ledgerBalanceCorrection.$inferSelect).amountMinor
									})
						};
					}
				);
			});
		},
		async updateTransaction(context: Context, transactionId: string, input: UpdateTransaction) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`transaction.update:${transactionId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransaction)
							.where(
								and(
									eq(ledgerTransaction.id, transactionId),
									eq(ledgerTransaction.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Transaction not found');
						if (before.source === 'transfer')
							throw new LedgerError(
								'conflict',
								'Transfer sides can only be changed through the transfer'
							);
						if (before.trashedAt)
							throw new LedgerError('conflict', 'Trashed transactions cannot be edited');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transaction version is stale');
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, before.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account || account.archivedAt)
							throw new LedgerError(
								'conflict',
								'Archived accounts do not allow transaction changes'
							);
						await validateSelectedCategory(
							tx,
							context.workspaceId,
							input.categoryId,
							before.categoryId
						);
						const [after] = await tx
							.update(ledgerTransaction)
							.set({
								kind: input.kind,
								amountMinor: parsePositiveMinor(input.amountMinor),
								date: input.date,
								description: input.description ?? null,
								categoryId: input.categoryId ?? null,
								version: before.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(ledgerTransaction.id, transactionId),
									eq(ledgerTransaction.workspaceId, context.workspaceId),
									eq(ledgerTransaction.version, input.version),
									isNull(ledgerTransaction.trashedAt)
								)
							)
							.returning();
						if (!after) throw new LedgerError('conflict', 'Transaction changed concurrently');
						await audit(tx, context, 'transaction', transactionId, 'updated', before, after);
						const total = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, account.id, account.openingDate, tx))
						);
						return {
							transaction: publicTransaction(after),
							balanceMinor: total.toString(),
							negativeBalance: total < 0n
						};
					}
				);
			});
		},
		async transactionAction(
			context: Context,
			transactionId: string,
			action: 'trash' | 'restore',
			input: VersionedMutation
		) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`transaction.${action}:${transactionId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransaction)
							.where(
								and(
									eq(ledgerTransaction.id, transactionId),
									eq(ledgerTransaction.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Transaction not found');
						if (before.source === 'transfer')
							throw new LedgerError(
								'conflict',
								'Transfer sides can only be changed through the transfer'
							);
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transaction version is stale');
						if (action === 'trash' && before.trashedAt)
							throw new LedgerError('conflict', 'Transaction is already trashed');
						if (action === 'restore' && !before.trashedAt)
							throw new LedgerError('conflict', 'Transaction is not trashed');
						const [account] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, before.accountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!account || account.archivedAt)
							throw new LedgerError(
								'conflict',
								'Archived accounts do not allow transaction changes'
							);
						const [after] = await tx
							.update(ledgerTransaction)
							.set({
								trashedAt: action === 'trash' ? new Date() : null,
								version: before.version + 1,
								updatedAt: new Date()
							})
							.where(
								and(
									eq(ledgerTransaction.id, transactionId),
									eq(ledgerTransaction.workspaceId, context.workspaceId),
									eq(ledgerTransaction.version, input.version),
									action === 'trash'
										? isNull(ledgerTransaction.trashedAt)
										: isNotNull(ledgerTransaction.trashedAt)
								)
							)
							.returning();
						if (!after) throw new LedgerError('conflict', 'Transaction changed concurrently');
						await audit(tx, context, 'transaction', transactionId, action, before, after);
						const total = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, account.id, account.openingDate, tx))
						);
						return {
							transaction: publicTransaction(after),
							balanceMinor: total.toString(),
							negativeBalance: total < 0n
						};
					}
				);
			});
		},
		async history(
			context: Context,
			entityType: 'account' | 'transaction' | 'transfer' | 'balance_check' | 'correction',
			entityId: string
		) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return tx
					.select()
					.from(ledgerAudit)
					.where(
						and(
							eq(ledgerAudit.workspaceId, context.workspaceId),
							eq(ledgerAudit.entityType, entityType),
							eq(ledgerAudit.entityId, entityId)
						)
					)
					.orderBy(desc(ledgerAudit.createdAt), desc(ledgerAudit.id));
			});
		},
		async purgeTrashed(before = new Date(Date.now() - 30 * 86_400_000)) {
			return database.transaction(async (tx) => {
				const deleted = await tx
					.delete(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.source, 'manual'),
							isNotNull(ledgerTransaction.trashedAt),
							lt(ledgerTransaction.trashedAt, before)
						)
					)
					.returning({ id: ledgerTransaction.id });
				return deleted.length;
			});
		},
		async purgeLifecycle(
			trashBefore = new Date(Date.now() - 30 * 86_400_000),
			receiptBefore = new Date(Date.now() - 37 * 86_400_000)
		) {
			return database.transaction(async (tx) => {
				const transfers = await tx
					.delete(ledgerTransfer)
					.where(
						and(isNotNull(ledgerTransfer.trashedAt), lt(ledgerTransfer.trashedAt, trashBefore))
					)
					.returning({ id: ledgerTransfer.id });
				const transactions = await tx
					.delete(ledgerTransaction)
					.where(
						and(
							eq(ledgerTransaction.source, 'manual'),
							isNotNull(ledgerTransaction.trashedAt),
							lt(ledgerTransaction.trashedAt, trashBefore)
						)
					)
					.returning({ id: ledgerTransaction.id });
				const balanceChecks = await tx
					.delete(ledgerBalanceCheck)
					.where(
						and(
							isNotNull(ledgerBalanceCheck.trashedAt),
							lt(ledgerBalanceCheck.trashedAt, trashBefore)
						)
					)
					.returning({ id: ledgerBalanceCheck.id });
				const corrections = await tx
					.delete(ledgerBalanceCorrection)
					.where(
						and(
							isNotNull(ledgerBalanceCorrection.trashedAt),
							lt(ledgerBalanceCorrection.trashedAt, trashBefore)
						)
					)
					.returning({ id: ledgerBalanceCorrection.id });
				// System maintenance is deliberately not audited: audit requires a real user actor.
				const receipts = await tx
					.delete(mutationReceipt)
					.where(lt(mutationReceipt.createdAt, receiptBefore))
					.returning({ id: mutationReceipt.id });
				return {
					transactions: transactions.length,
					transfers: transfers.length,
					balanceChecks: balanceChecks.length,
					corrections: corrections.length,
					idempotencyReceipts: receipts.length
				};
			});
		}
	};
}

export type LedgerRepository = ReturnType<typeof createLedgerRepository>;
