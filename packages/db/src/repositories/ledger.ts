import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';

import type { FinancialDatabase } from '../connection';
import {
	financialAccount,
	ledgerAudit,
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
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
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
const checkedBalance = (value: bigint) => {
	if (value < INT64_MIN || value > INT64_MAX)
		throw new LedgerError('invalid', 'Balance exceeds the signed 64-bit integer range');
	return value;
};
const publicTransaction = (row: typeof ledgerTransaction.$inferSelect) => ({
	...row,
	amountMinor: row.amountMinor.toString()
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
		source: FinancialDatabase | Transaction = database
	) {
		const rows = await source
			.select({ kind: ledgerTransaction.kind, amountMinor: ledgerTransaction.amountMinor })
			.from(ledgerTransaction)
			.where(
				and(
					eq(ledgerTransaction.workspaceId, workspaceId),
					eq(ledgerTransaction.accountId, accountId),
					isNull(ledgerTransaction.trashedAt)
				)
			);
		return rows.reduce(
			(sum, row) => sum + (row.kind === 'income' ? row.amountMinor : -row.amountMinor),
			0n
		);
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
		entityType: 'account' | 'transaction',
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
						includeTrashed ? undefined : isNull(ledgerTransaction.trashedAt)
					)
				);
			return rows.map(publicTransaction);
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
		async history(context: Context, entityType: 'account' | 'transaction', entityId: string) {
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
				.where(and(isNotNull(ledgerTransaction.trashedAt), lt(ledgerTransaction.trashedAt, before)))
				.returning({ id: ledgerTransaction.id });
			return deleted.length;
		},
		async purgeLifecycle(
			trashBefore = new Date(Date.now() - 30 * 86_400_000),
			receiptBefore = new Date(Date.now() - 37 * 86_400_000)
		) {
			const transactions = await this.purgeTrashed(trashBefore);
			// System maintenance is deliberately not audited: audit requires a real user actor.
			const receipts = await database
				.delete(mutationReceipt)
				.where(lt(mutationReceipt.createdAt, receiptBefore))
				.returning({ id: mutationReceipt.id });
			return { transactions, idempotencyReceipts: receipts.length };
		}
	};
}

export type LedgerRepository = ReturnType<typeof createLedgerRepository>;
