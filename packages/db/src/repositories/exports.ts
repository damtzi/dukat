import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import type { Database, FinancialDatabase } from '../connection';
import {
	categoryBudget,
	financialAccount,
	householdExpense,
	householdExpenseAllocation,
	ledgerAudit,
	ledgerBalanceCheck,
	ledgerBalanceCorrection,
	ledgerCategory,
	ledgerImportBatch,
	ledgerTransaction,
	ledgerTransfer,
	netWorthSnapshot,
	plannedOccurrenceException,
	plannedOccurrenceMatch,
	plannedSeries,
	settlementPayment,
	user,
	workspace,
	workspaceManualRate,
	workspaceMembership
} from '../schema';
import { listAuthorizedWorkspaces } from './workspaces';

export const USER_EXPORT_CONTRACT = 'dukat.user-export';
export const USER_EXPORT_VERSION = 1;
export const CSV_EXPORT_VERSION = 1;
export type CsvExport = 'transactions' | 'balances' | 'budgets' | 'future-holdings';

const PAGE_SIZE = 250;
const json = (value: unknown) =>
	JSON.stringify(value, (_key, item) =>
		typeof item === 'bigint' ? item.toString() : item instanceof Date ? item.toISOString() : item
	);
const csv = (value: unknown) => {
	const text =
		value === null || value === undefined
			? ''
			: value instanceof Date
				? value.toISOString()
				: String(value);
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvRow = (values: unknown[]) => `${values.map(csv).join(',')}\r\n`;

async function* pages<T>(load: (offset: number) => Promise<T[]>): AsyncGenerator<T> {
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const rows = await load(offset);
		for (const row of rows) yield row;
		if (rows.length < PAGE_SIZE) return;
	}
}

async function* jsonArray<T>(rows: AsyncIterable<T>) {
	let first = true;
	yield '[';
	for await (const row of rows) {
		yield `${first ? '' : ','}${json(row)}`;
		first = false;
	}
	yield ']';
}

export function createExportRepository(
	database: Database,
	financialDatabase: FinancialDatabase,
	now = () => new Date()
) {
	async function scope(userId: string) {
		const workspaces = await listAuthorizedWorkspaces(database, userId);
		const workspaceIds = workspaces.map(({ id }) => id);
		const scopeById = new Map(workspaces.map((item) => [item.id, item.type]));
		return { workspaces, workspaceIds, scopeById };
	}

	async function* workspaceRows(userId: string) {
		const { workspaceIds } = await scope(userId);
		if (!workspaceIds.length) return;
		yield* pages((offset) =>
			database
				.select()
				.from(workspace)
				.where(inArray(workspace.id, workspaceIds))
				.orderBy(asc(workspace.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		);
	}

	async function* tableRows<T>(
		workspaceIds: string[],
		load: (offset: number, workspaceIds: string[]) => Promise<T[]>
	) {
		if (!workspaceIds.length) return;
		yield* pages((offset) => load(offset, workspaceIds));
	}

	const dataSets = (userId: string, workspaceIds: string[]) => ({
		workspaces: workspaceRows(userId),
		householdMemberships: tableRows(workspaceIds, (offset, ids) =>
			database
				.select({
					workspaceId: workspaceMembership.workspaceId,
					userId: workspaceMembership.userId,
					role: workspaceMembership.role,
					createdAt: workspaceMembership.createdAt,
					name: user.name,
					username: user.username,
					image: user.image
				})
				.from(workspaceMembership)
				.innerJoin(user, eq(user.id, workspaceMembership.userId))
				.where(inArray(workspaceMembership.workspaceId, ids))
				.orderBy(asc(workspaceMembership.workspaceId), asc(workspaceMembership.userId))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		accounts: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(financialAccount)
				.where(inArray(financialAccount.workspaceId, ids))
				.orderBy(asc(financialAccount.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		categories: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(ledgerCategory)
				.where(inArray(ledgerCategory.workspaceId, ids))
				.orderBy(asc(ledgerCategory.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		transactions: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(ledgerTransaction)
				.where(inArray(ledgerTransaction.workspaceId, ids))
				.orderBy(asc(ledgerTransaction.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		householdExpenses: tableRows(workspaceIds, async (offset, ids) => {
			const rows = await financialDatabase
				.select()
				.from(householdExpense)
				.where(inArray(householdExpense.workspaceId, ids))
				.orderBy(asc(householdExpense.id))
				.limit(PAGE_SIZE)
				.offset(offset);
			return rows.map((row) => ({
				...row,
				sourceTransactionId: null,
				sourceVisibility: 'private'
			}));
		}),
		personalHouseholdFundingLinks: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select({
					householdExpenseId: householdExpense.id,
					sourceTransactionId: householdExpense.sourceTransactionId
				})
				.from(householdExpense)
				.innerJoin(
					ledgerTransaction,
					eq(ledgerTransaction.id, householdExpense.sourceTransactionId)
				)
				.where(
					and(
						inArray(householdExpense.workspaceId, ids),
						inArray(ledgerTransaction.workspaceId, ids),
						eq(householdExpense.payerUserId, userId)
					)
				)
				.orderBy(asc(householdExpense.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		householdExpenseAllocations: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(householdExpenseAllocation)
				.where(inArray(householdExpenseAllocation.workspaceId, ids))
				.orderBy(
					asc(householdExpenseAllocation.expenseId),
					asc(householdExpenseAllocation.memberUserId)
				)
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		settlementPayments: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(settlementPayment)
				.where(inArray(settlementPayment.workspaceId, ids))
				.orderBy(asc(settlementPayment.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		transfers: tableRows(workspaceIds, async (offset, ids) => {
			const rows = await financialDatabase
				.selectDistinct({ transfer: ledgerTransfer })
				.from(ledgerTransfer)
				.innerJoin(ledgerTransaction, eq(ledgerTransaction.transferId, ledgerTransfer.id))
				.where(inArray(ledgerTransaction.workspaceId, ids))
				.orderBy(asc(ledgerTransfer.id))
				.limit(PAGE_SIZE)
				.offset(offset);
			if (!rows.length) return [];
			const sides = await financialDatabase
				.select({
					transferId: ledgerTransaction.transferId,
					workspaceId: ledgerTransaction.workspaceId
				})
				.from(ledgerTransaction)
				.where(
					inArray(
						ledgerTransaction.transferId,
						rows.map(({ transfer }) => transfer.id)
					)
				);
			return rows.map(({ transfer }) => {
				const transferSides = sides.filter((side) => side.transferId === transfer.id);
				const full =
					transferSides.length === 2 &&
					transferSides.every((side) => ids.includes(side.workspaceId));
				return {
					...transfer,
					sentAmountMinor: full ? transfer.sentAmountMinor : null,
					receivedAmountMinor: full ? transfer.receivedAmountMinor : null,
					visibility: full ? 'full' : 'private-counterparty'
				};
			});
		}),
		balanceSnapshots: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(ledgerBalanceCheck)
				.where(inArray(ledgerBalanceCheck.workspaceId, ids))
				.orderBy(asc(ledgerBalanceCheck.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		balanceCorrections: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(ledgerBalanceCorrection)
				.where(inArray(ledgerBalanceCorrection.workspaceId, ids))
				.orderBy(asc(ledgerBalanceCorrection.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		importBatches: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(ledgerImportBatch)
				.where(inArray(ledgerImportBatch.workspaceId, ids))
				.orderBy(asc(ledgerImportBatch.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		plans: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(plannedSeries)
				.where(inArray(plannedSeries.workspaceId, ids))
				.orderBy(asc(plannedSeries.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		planExceptions: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(plannedOccurrenceException)
				.where(inArray(plannedOccurrenceException.workspaceId, ids))
				.orderBy(asc(plannedOccurrenceException.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		planMatches: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(plannedOccurrenceMatch)
				.where(inArray(plannedOccurrenceMatch.workspaceId, ids))
				.orderBy(asc(plannedOccurrenceMatch.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		budgets: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(categoryBudget)
				.where(inArray(categoryBudget.workspaceId, ids))
				.orderBy(asc(categoryBudget.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		manualExchangeRates: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select()
				.from(workspaceManualRate)
				.where(inArray(workspaceManualRate.workspaceId, ids))
				.orderBy(asc(workspaceManualRate.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		auditHistory: tableRows(workspaceIds, (offset, ids) =>
			financialDatabase
				.select({
					id: ledgerAudit.id,
					workspaceId: ledgerAudit.workspaceId,
					actorUserId: ledgerAudit.actorUserId,
					actorDisplay: ledgerAudit.actorDisplay,
					entityType: ledgerAudit.entityType,
					entityId: ledgerAudit.entityId,
					action: ledgerAudit.action,
					createdAt: ledgerAudit.createdAt
				})
				.from(ledgerAudit)
				.where(inArray(ledgerAudit.workspaceId, ids))
				.orderBy(asc(ledgerAudit.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		),
		netWorthHistory: pages((offset) =>
			financialDatabase
				.select()
				.from(netWorthSnapshot)
				.where(eq(netWorthSnapshot.userId, userId))
				.orderBy(asc(netWorthSnapshot.date))
				.limit(PAGE_SIZE)
				.offset(offset)
		)
	});

	async function* completeJson(userId: string) {
		const { workspaceIds } = await scope(userId);
		const [owner] = await database
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				email: user.email,
				image: user.image
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		yield `{"contract":${json(USER_EXPORT_CONTRACT)},"version":${USER_EXPORT_VERSION},"exportedAt":${json(now().toISOString())},"owner":${json(owner ?? null)},"data":{`;
		let first = true;
		for (const [name, rows] of Object.entries(dataSets(userId, workspaceIds))) {
			yield `${first ? '' : ','}${json(name)}:`;
			yield* jsonArray(rows as AsyncIterable<unknown>);
			first = false;
		}
		yield '}}';
	}

	async function* transactionsCsv(userId: string) {
		const { workspaceIds, scopeById } = await scope(userId);
		yield csvRow([
			'contract_version',
			'workspace_scope',
			'workspace_id',
			'transaction_id',
			'account_id',
			'account_currency',
			'category_id',
			'refund_of_transaction_id',
			'import_batch_id',
			'import_source_row',
			'kind',
			'amount_minor',
			'date',
			'merchant',
			'description',
			'source',
			'transfer_id',
			'transfer_side',
			'record_version',
			'trashed_at',
			'created_at',
			'updated_at'
		]);
		yield* pages(async (offset) => {
			if (!workspaceIds.length) return [];
			const rows = await financialDatabase
				.select({ transaction: ledgerTransaction, currency: financialAccount.currency })
				.from(ledgerTransaction)
				.innerJoin(financialAccount, eq(financialAccount.id, ledgerTransaction.accountId))
				.where(inArray(ledgerTransaction.workspaceId, workspaceIds))
				.orderBy(asc(ledgerTransaction.id))
				.limit(PAGE_SIZE)
				.offset(offset);
			return rows.map(({ transaction: row, currency }) =>
				csvRow([
					CSV_EXPORT_VERSION,
					scopeById.get(row.workspaceId),
					row.workspaceId,
					row.id,
					row.accountId,
					currency,
					row.categoryId,
					row.refundOfTransactionId,
					row.importBatchId,
					row.importSourceRow,
					row.kind,
					row.amountMinor,
					row.date,
					row.merchant,
					row.description,
					row.source,
					row.transferId,
					row.transferSide,
					row.version,
					row.trashedAt,
					row.createdAt,
					row.updatedAt
				])
			);
		});
	}

	async function currentBalance(account: typeof financialAccount.$inferSelect) {
		let balance = account.openingBalanceMinor;
		for await (const row of pages((offset) =>
			financialDatabase
				.select({ kind: ledgerTransaction.kind, amountMinor: ledgerTransaction.amountMinor })
				.from(ledgerTransaction)
				.where(
					and(
						eq(ledgerTransaction.workspaceId, account.workspaceId),
						eq(ledgerTransaction.accountId, account.id),
						isNull(ledgerTransaction.trashedAt),
						gt(ledgerTransaction.date, account.openingDate)
					)
				)
				.orderBy(asc(ledgerTransaction.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		))
			balance += row.kind === 'expense' ? -row.amountMinor : row.amountMinor;
		for await (const row of pages((offset) =>
			financialDatabase
				.select({ amountMinor: ledgerBalanceCorrection.amountMinor })
				.from(ledgerBalanceCorrection)
				.where(
					and(
						eq(ledgerBalanceCorrection.workspaceId, account.workspaceId),
						eq(ledgerBalanceCorrection.accountId, account.id),
						isNull(ledgerBalanceCorrection.trashedAt),
						gt(ledgerBalanceCorrection.date, account.openingDate)
					)
				)
				.orderBy(asc(ledgerBalanceCorrection.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		))
			balance += BigInt(row.amountMinor);
		return balance;
	}

	async function* balancesCsv(userId: string) {
		const { workspaceIds, scopeById } = await scope(userId);
		yield csvRow([
			'contract_version',
			'workspace_scope',
			'workspace_id',
			'record_type',
			'record_id',
			'account_id',
			'account_currency',
			'date',
			'amount_minor',
			'record_version',
			'trashed_at',
			'archived_at',
			'created_at',
			'updated_at'
		]);
		if (!workspaceIds.length) return;
		for await (const account of pages((offset) =>
			financialDatabase
				.select()
				.from(financialAccount)
				.where(inArray(financialAccount.workspaceId, workspaceIds))
				.orderBy(asc(financialAccount.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		)) {
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(account.workspaceId),
				account.workspaceId,
				'opening_balance',
				account.id,
				account.id,
				account.currency,
				account.openingDate,
				account.openingBalanceMinor,
				account.version,
				null,
				account.archivedAt,
				account.createdAt,
				account.updatedAt
			]);
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(account.workspaceId),
				account.workspaceId,
				'current_balance',
				account.id,
				account.id,
				account.currency,
				now().toISOString().slice(0, 10),
				await currentBalance(account),
				account.version,
				null,
				account.archivedAt,
				account.createdAt,
				account.updatedAt
			]);
		}
		for await (const row of pages((offset) =>
			financialDatabase
				.select({ value: ledgerBalanceCheck, currency: financialAccount.currency })
				.from(ledgerBalanceCheck)
				.innerJoin(financialAccount, eq(financialAccount.id, ledgerBalanceCheck.accountId))
				.where(inArray(ledgerBalanceCheck.workspaceId, workspaceIds))
				.orderBy(asc(ledgerBalanceCheck.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		))
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(row.value.workspaceId),
				row.value.workspaceId,
				'snapshot',
				row.value.id,
				row.value.accountId,
				row.currency,
				row.value.date,
				row.value.observedBalanceMinor,
				row.value.version,
				row.value.trashedAt,
				null,
				row.value.createdAt,
				row.value.updatedAt
			]);
		for await (const row of pages((offset) =>
			financialDatabase
				.select({ value: ledgerBalanceCorrection, currency: financialAccount.currency })
				.from(ledgerBalanceCorrection)
				.innerJoin(financialAccount, eq(financialAccount.id, ledgerBalanceCorrection.accountId))
				.where(inArray(ledgerBalanceCorrection.workspaceId, workspaceIds))
				.orderBy(asc(ledgerBalanceCorrection.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		))
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(row.value.workspaceId),
				row.value.workspaceId,
				'correction',
				row.value.id,
				row.value.accountId,
				row.currency,
				row.value.date,
				row.value.amountMinor,
				row.value.version,
				row.value.trashedAt,
				null,
				row.value.createdAt,
				row.value.updatedAt
			]);
	}

	async function* budgetsCsv(userId: string) {
		const { workspaceIds, scopeById } = await scope(userId);
		yield csvRow([
			'contract_version',
			'workspace_scope',
			'workspace_id',
			'budget_id',
			'category_id',
			'month',
			'amount_minor',
			'currency',
			'record_version',
			'created_at',
			'updated_at'
		]);
		if (!workspaceIds.length) return;
		for await (const row of pages((offset) =>
			financialDatabase
				.select()
				.from(categoryBudget)
				.where(inArray(categoryBudget.workspaceId, workspaceIds))
				.orderBy(asc(categoryBudget.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		))
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(row.workspaceId),
				row.workspaceId,
				row.id,
				row.categoryId,
				row.month,
				row.amountMinor,
				row.reportingCurrency,
				row.version,
				row.createdAt,
				row.updatedAt
			]);
	}

	async function* futureHoldingsCsv(userId: string) {
		const { workspaceIds, scopeById } = await scope(userId);
		yield csvRow([
			'contract_version',
			'workspace_scope',
			'workspace_id',
			'plan_id',
			'root_plan_id',
			'account_id',
			'account_currency',
			'category_id',
			'kind',
			'amount_minor',
			'date',
			'effective_from',
			'status',
			'description',
			'recurrence_frequency',
			'recurrence_interval',
			'recurrence_end_date',
			'cutoff_date',
			'cancelled',
			'record_version',
			'created_at',
			'updated_at'
		]);
		if (!workspaceIds.length) return;
		for await (const row of pages((offset) =>
			financialDatabase
				.select({ plan: plannedSeries, currency: financialAccount.currency })
				.from(plannedSeries)
				.innerJoin(financialAccount, eq(financialAccount.id, plannedSeries.accountId))
				.where(inArray(plannedSeries.workspaceId, workspaceIds))
				.orderBy(asc(plannedSeries.id))
				.limit(PAGE_SIZE)
				.offset(offset)
		)) {
			const plan = row.plan;
			yield csvRow([
				CSV_EXPORT_VERSION,
				scopeById.get(plan.workspaceId),
				plan.workspaceId,
				plan.id,
				plan.rootPlanId,
				plan.accountId,
				row.currency,
				plan.categoryId,
				plan.kind,
				plan.amountMinor,
				plan.date,
				plan.effectiveFrom,
				plan.status,
				plan.description,
				plan.recurrenceFrequency,
				plan.recurrenceInterval,
				plan.recurrenceEndDate,
				plan.cutoffDate,
				Boolean(plan.cancelled),
				plan.version,
				plan.createdAt,
				plan.updatedAt
			]);
		}
	}

	return {
		completeJson,
		csv(userId: string, exportName: CsvExport) {
			if (exportName === 'transactions') return transactionsCsv(userId);
			if (exportName === 'balances') return balancesCsv(userId);
			if (exportName === 'budgets') return budgetsCsv(userId);
			return futureHoldingsCsv(userId);
		}
	};
}

export type ExportRepository = ReturnType<typeof createExportRepository>;
