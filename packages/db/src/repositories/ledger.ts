import { and, desc, eq, inArray, isNotNull, isNull, lte, lt, or } from 'drizzle-orm';

import type { FinancialDatabase } from '../connection';
import {
	financialAccount,
	ledgerAudit,
	ledgerBalanceCheck,
	ledgerBalanceCorrection,
	ledgerTransfer,
	ledgerTransaction,
	mutationReceipt,
	workspace
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
interface CreateAccount extends Mutation {
	name: string;
	type: 'current' | 'savings' | 'cash';
	currency: string;
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
}
interface UpdateTransaction extends CreateTransaction {
	version: number;
}
interface CreateTransfer extends Mutation {
	fromAccountId: string;
	toAccountId: string;
	amountMinor: string;
	date: string;
	description?: string | null;
}
interface UpdateTransfer extends Mutation {
	toAccountId: string;
	amountMinor: string;
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
const publicTransfer = (row: typeof ledgerTransfer.$inferSelect) => ({
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

export function createLedgerRepository(database: FinancialDatabase) {
	type Transaction = Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0];
	async function balance(
		workspaceId: string,
		accountId: string,
		source: FinancialDatabase | Transaction = database,
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
					throughDate ? lte(ledgerBalanceCorrection.date, throughDate) : undefined
				)
			);
		return transactionTotal + corrections.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
	}
	async function accountView(
		account: typeof financialAccount.$inferSelect,
		source: FinancialDatabase | Transaction = database
	) {
		return viewAccount(
			account,
			checkedBalance(
				account.openingBalanceMinor + (await balance(account.workspaceId, account.id, source))
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
			checkedBalance(account.openingBalanceMinor + (await balance(workspaceId, account.id, tx)));
	}
	async function canonicalTransferSides(
		tx: Transaction,
		transfer: typeof ledgerTransfer.$inferSelect
	) {
		const sides = await tx
			.select()
			.from(ledgerTransaction)
			.where(
				and(
					eq(ledgerTransaction.workspaceId, transfer.workspaceId),
					eq(ledgerTransaction.transferId, transfer.id)
				)
			);
		const from = sides.find((side) => side.transferSide === 'from');
		const to = sides.find((side) => side.transferSide === 'to');
		const matches = (
			side: typeof ledgerTransaction.$inferSelect,
			accountId: string,
			kind: string
		) =>
			side.source === 'transfer' &&
			side.accountId === accountId &&
			side.kind === kind &&
			side.amountMinor === transfer.amountMinor &&
			side.date === transfer.date &&
			side.description === transfer.description &&
			side.version === transfer.version &&
			Number(side.trashedAt) === Number(transfer.trashedAt);
		if (
			!from ||
			!to ||
			sides.length !== 2 ||
			!matches(from, transfer.fromAccountId, 'expense') ||
			!matches(to, transfer.toAccountId, 'income')
		)
			throw new LedgerError('conflict', 'Transfer sides are corrupt or incomplete');
		return { from, to };
	}
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
					eq(workspace.type, 'personal'),
					eq(workspace.personalOwnerUserId, context.userId)
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
	async function audit(
		tx: Parameters<Parameters<FinancialDatabase['transaction']>[0]>[0],
		context: Context,
		entityType: 'account' | 'transaction' | 'transfer' | 'balance_check' | 'correction',
		entityId: string,
		action: string,
		before: unknown,
		after: unknown
	) {
		await tx.insert(ledgerAudit).values({
			id: crypto.randomUUID(),
			workspaceId: context.workspaceId,
			actorUserId: context.userId,
			entityType,
			entityId,
			action,
			beforeJson: before == null ? null : json(before),
			afterJson: after == null ? null : json(after)
		});
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
						openingBalanceMinor: parseMinor(input.openingBalanceMinor)
					};
					await tx.insert(financialAccount).values(row);
					const [created] = await tx
						.select()
						.from(financialAccount)
						.where(eq(financialAccount.id, row.id));
					await audit(tx, context, 'account', created.id, 'opening_balance.created', null, {
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
						if (before.activityStartedAt && before.currency !== input.currency)
							throw new LedgerError(
								'conflict',
								'Account currency is immutable after activity exists'
							);
						if (
							before.archivedAt &&
							before.openingBalanceMinor !== parseMinor(input.openingBalanceMinor)
						)
							throw new LedgerError('conflict', 'Archived account opening balance is immutable');
						const updatedRows = await tx
							.update(financialAccount)
							.set({
								name: input.name,
								type: input.type,
								currency: input.currency,
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
						if (before.openingBalanceMinor !== after.openingBalanceMinor)
							await audit(
								tx,
								context,
								'account',
								accountId,
								'opening_balance.updated',
								{
									openingBalanceMinor: before.openingBalanceMinor,
									currency: before.currency
								},
								{
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
		async accountAction(
			context: Context,
			accountId: string,
			action: 'delete' | 'archive' | 'restore',
			input: VersionedMutation
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
						const [row] = await tx
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
							row.openingBalanceMinor + (await balance(context.workspaceId, accountId, tx))
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
								archivedAt: action === 'archive' ? new Date() : null,
								version: row.version + 1,
								updatedAt: new Date()
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
						await audit(tx, context, 'account', accountId, action, row, updated);
						return viewAccount(updated, currentBalance);
					}
				);
			});
		},
		async listTransactions(context: Context, accountId: string, includeTrashed = false) {
			await database.transaction((tx) => authorizedPersonal(tx, context));
			const rows = await database
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
		},
		async listTransfers(context: Context, accountId: string, includeTrashed = false) {
			await database.transaction((tx) => authorizedPersonal(tx, context));
			const rows = await database
				.select()
				.from(ledgerTransfer)
				.where(
					and(
						eq(ledgerTransfer.workspaceId, context.workspaceId),
						or(
							eq(ledgerTransfer.fromAccountId, accountId),
							eq(ledgerTransfer.toAccountId, accountId)
						),
						includeTrashed ? undefined : isNull(ledgerTransfer.trashedAt)
					)
				);
			return rows.map(publicTransfer);
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
							description: input.description ?? null
						};
						await tx.insert(ledgerTransaction).values(row);
						const [created] = await tx
							.select()
							.from(ledgerTransaction)
							.where(eq(ledgerTransaction.id, row.id));
						await audit(tx, context, 'transaction', created.id, 'created', null, created);
						const amount = checkedBalance(
							account.openingBalanceMinor + (await balance(context.workspaceId, accountId, tx))
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
				return idempotent(tx, context, 'transfer.create', input.idempotencyKey, input, async () => {
					if (input.fromAccountId === input.toAccountId)
						throw new LedgerError('invalid', 'Transfer accounts must be different');
					const accounts = await tx
						.select()
						.from(financialAccount)
						.where(and(eq(financialAccount.workspaceId, context.workspaceId)));
					const from = accounts.find((a) => a.id === input.fromAccountId),
						to = accounts.find((a) => a.id === input.toAccountId);
					if (!from || !to) throw new LedgerError('not_found', 'Transfer account not found');
					if (from.archivedAt || to.archivedAt)
						throw new LedgerError('conflict', 'Archived accounts do not accept transfers');
					if (from.currency !== to.currency)
						throw new LedgerError('invalid', 'Transfer accounts must use the same currency');
					const id = crypto.randomUUID(),
						amount = parsePositiveMinor(input.amountMinor),
						now = new Date();
					await tx.insert(ledgerTransfer).values({
						id,
						workspaceId: context.workspaceId,
						fromAccountId: from.id,
						toAccountId: to.id,
						amountMinor: amount,
						date: input.date,
						description: input.description ?? null
					});
					await tx.insert(ledgerTransaction).values([
						{
							id: crypto.randomUUID(),
							workspaceId: context.workspaceId,
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
							workspaceId: context.workspaceId,
							accountId: to.id,
							kind: 'income',
							amountMinor: amount,
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
								eq(financialAccount.workspaceId, context.workspaceId),
								inArray(financialAccount.id, [from.id, to.id]),
								isNull(financialAccount.activityStartedAt)
							)
						);
					const [created] = await tx.select().from(ledgerTransfer).where(eq(ledgerTransfer.id, id));
					await audit(tx, context, 'transfer', id, 'created', null, created);
					await assertBalances(tx, context.workspaceId, [from.id, to.id]);
					return publicTransfer(created);
				});
			});
		},
		async updateTransfer(context: Context, transferId: string, input: UpdateTransfer) {
			return database.transaction(async (tx) => {
				await authorizedPersonal(tx, context);
				return idempotent(
					tx,
					context,
					`transfer.update:${transferId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransfer)
							.where(
								and(
									eq(ledgerTransfer.id, transferId),
									eq(ledgerTransfer.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Transfer not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transfer version is stale');
						if (before.trashedAt)
							throw new LedgerError('conflict', 'Trashed transfers cannot be edited');
						await canonicalTransferSides(tx, before);
						if (input.toAccountId === before.fromAccountId)
							throw new LedgerError('invalid', 'Transfer accounts must be different');
						const [to] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, input.toAccountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						const [from] = await tx
							.select()
							.from(financialAccount)
							.where(
								and(
									eq(financialAccount.id, before.fromAccountId),
									eq(financialAccount.workspaceId, context.workspaceId)
								)
							);
						if (!to || !from) throw new LedgerError('not_found', 'Transfer account not found');
						if (to.archivedAt || from.archivedAt)
							throw new LedgerError('conflict', 'Archived accounts do not allow transfer changes');
						if (to.currency !== from.currency)
							throw new LedgerError('invalid', 'Transfer accounts must use the same currency');
						const amount = parsePositiveMinor(input.amountMinor),
							now = new Date();
						const updatedAggregates = await tx
							.update(ledgerTransfer)
							.set({
								toAccountId: to.id,
								amountMinor: amount,
								date: input.date,
								description: input.description ?? null,
								version: before.version + 1,
								updatedAt: now
							})
							.where(
								and(
									eq(ledgerTransfer.id, transferId),
									eq(ledgerTransfer.workspaceId, context.workspaceId),
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
									eq(ledgerTransaction.workspaceId, context.workspaceId),
									eq(ledgerTransaction.transferId, transferId),
									eq(ledgerTransaction.version, input.version)
								)
							)
							.returning({ id: ledgerTransaction.id });
						if (updatedSides.length !== 2)
							throw new LedgerError('conflict', 'Transfer sides changed concurrently');
						const movedSide = await tx
							.update(ledgerTransaction)
							.set({ accountId: to.id })
							.where(
								and(
									eq(ledgerTransaction.workspaceId, context.workspaceId),
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
									eq(financialAccount.workspaceId, context.workspaceId),
									isNull(financialAccount.activityStartedAt)
								)
							);
						await assertBalances(tx, context.workspaceId, [
							before.fromAccountId,
							before.toAccountId,
							to.id
						]);
						await audit(tx, context, 'transfer', transferId, 'updated', before, after);
						return publicTransfer(after);
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
				return idempotent(
					tx,
					context,
					`transfer.${action}:${transferId}`,
					input.idempotencyKey,
					input,
					async () => {
						const [before] = await tx
							.select()
							.from(ledgerTransfer)
							.where(
								and(
									eq(ledgerTransfer.id, transferId),
									eq(ledgerTransfer.workspaceId, context.workspaceId)
								)
							);
						if (!before) throw new LedgerError('not_found', 'Transfer not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Transfer version is stale');
						if ((action === 'trash') === !!before.trashedAt)
							throw new LedgerError(
								'conflict',
								`Transfer is ${action === 'trash' ? 'already trashed' : 'not trashed'}`
							);
						await canonicalTransferSides(tx, before);
						const accounts = await tx
							.select()
							.from(financialAccount)
							.where(and(eq(financialAccount.workspaceId, context.workspaceId)));
						if (
							accounts.some(
								(a) =>
									(a.id === before.fromAccountId || a.id === before.toAccountId) && a.archivedAt
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
									eq(ledgerTransfer.workspaceId, context.workspaceId),
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
									eq(ledgerTransaction.workspaceId, context.workspaceId),
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
						await assertBalances(tx, context.workspaceId, [
							before.fromAccountId,
							before.toAccountId
						]);
						await audit(tx, context, 'transfer', transferId, action, before, after);
						return publicTransfer(after);
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
							throw new LedgerError('conflict', 'Archived accounts do not accept balance checks');
						const observed = parseMinor(input.observedBalanceMinor);
						const calculated = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, account.id, tx, input.date))
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
								(await balance(context.workspaceId, accountId, tx, row.date))
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
			await database.transaction((tx) => authorizedPersonal(tx, context));
			const [account] = await database
				.select({ id: financialAccount.id })
				.from(financialAccount)
				.where(
					and(
						eq(financialAccount.id, accountId),
						eq(financialAccount.workspaceId, context.workspaceId)
					)
				);
			if (!account) throw new LedgerError('not_found', 'Account not found');
			const rows = await database
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
						if (!before) throw new LedgerError('not_found', 'Balance check not found');
						if (before.version !== input.version)
							throw new LedgerError('conflict', 'Balance check version is stale');
						if (before.trashedAt)
							throw new LedgerError('conflict', 'Trashed balance checks cannot be edited');
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
								'Archived accounts do not allow balance check changes'
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
						if (!after) throw new LedgerError('conflict', 'Balance check changed concurrently');
						const calculated = checkedBalance(
							account.openingBalanceMinor +
								(await balance(context.workspaceId, account.id, tx, input.date))
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
						const [after] = await tx
							.update(ledgerTransaction)
							.set({
								kind: input.kind,
								amountMinor: parsePositiveMinor(input.amountMinor),
								date: input.date,
								description: input.description ?? null,
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
							account.openingBalanceMinor + (await balance(context.workspaceId, account.id, tx))
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
							account.openingBalanceMinor + (await balance(context.workspaceId, account.id, tx))
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
			await database.transaction((tx) => authorizedPersonal(tx, context));
			return database
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
		},
		async purgeTrashed(before = new Date(Date.now() - 30 * 86_400_000)) {
			const deleted = await database
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
