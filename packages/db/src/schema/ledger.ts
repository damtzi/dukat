import { relations, sql } from 'drizzle-orm';
import {
	check,
	customType,
	foreignKey,
	index,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { user } from './auth';
import { workspace } from './workspaces';

const int64 = customType<{ data: bigint; driverData: bigint }>({
	dataType: () => 'integer',
	toDriver: (value) => value,
	fromDriver: (value) => value
});
const safeInteger = customType<{ data: number; driverData: bigint }>({
	dataType: () => 'integer',
	toDriver: (value) => BigInt(value),
	fromDriver: (value) => {
		const number = Number(value);
		if (!Number.isSafeInteger(number))
			throw new Error('Ledger version is outside the safe integer range');
		return number;
	}
});
const secondsTimestamp = customType<{ data: Date; driverData: bigint }>({
	dataType: () => 'integer',
	toDriver: (value) => BigInt(Math.floor(value.getTime() / 1000)),
	fromDriver: (value) => new Date(Number(value) * 1000)
});

export const financialAccount = sqliteTable(
	'financial_account',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		type: text('type', { enum: ['current', 'savings', 'cash'] }).notNull(),
		currency: text('currency').notNull(),
		openingBalanceMinor: int64('opening_balance_minor').notNull(),
		version: safeInteger('version').default(1).notNull(),
		activityStartedAt: secondsTimestamp('activity_started_at'),
		archivedAt: secondsTimestamp('archived_at'),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: secondsTimestamp('updated_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		index('financial_account_workspace_idx').on(table.workspaceId),
		uniqueIndex('financial_account_workspace_id_unique').on(table.workspaceId, table.id),
		check('financial_account_type_check', sql`${table.type} IN ('current', 'savings', 'cash')`),
		check(
			'financial_account_opening_int64_check',
			sql`${table.openingBalanceMinor} BETWEEN -9223372036854775808 AND 9223372036854775807`
		),
		check('financial_account_version_check', sql`${table.version} > 0`)
	]
);

export const ledgerTransaction = sqliteTable(
	'ledger_transaction',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
		amountMinor: int64('amount_minor').notNull(),
		date: text('date').notNull(),
		description: text('description'),
		source: text('source', { enum: ['manual'] })
			.default('manual')
			.notNull(),
		version: safeInteger('version').default(1).notNull(),
		trashedAt: secondsTimestamp('trashed_at'),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: secondsTimestamp('updated_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		foreignKey({
			columns: [table.workspaceId, table.accountId],
			foreignColumns: [financialAccount.workspaceId, financialAccount.id],
			name: 'ledger_transaction_workspace_account_fk'
		}).onDelete('restrict'),
		index('ledger_transaction_account_idx').on(table.accountId),
		index('ledger_transaction_trash_idx').on(table.trashedAt),
		check('ledger_transaction_kind_check', sql`${table.kind} IN ('income', 'expense')`),
		check('ledger_transaction_amount_check', sql`${table.amountMinor} > 0`),
		check(
			'ledger_transaction_amount_int64_check',
			sql`${table.amountMinor} <= 9223372036854775807`
		),
		check(
			'ledger_transaction_date_check',
			sql`${table.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`
		),
		check('ledger_transaction_version_check', sql`${table.version} > 0`)
	]
);

export const ledgerAudit = sqliteTable(
	'ledger_audit',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		actorUserId: text('actor_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		entityType: text('entity_type', { enum: ['transaction', 'account'] }).notNull(),
		entityId: text('entity_id').notNull(),
		action: text('action').notNull(),
		beforeJson: text('before_json'),
		afterJson: text('after_json'),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		index('ledger_audit_entity_idx').on(table.workspaceId, table.entityType, table.entityId)
	]
);

export const mutationReceipt = sqliteTable(
	'mutation_receipt',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		actorUserId: text('actor_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		operation: text('operation').notNull(),
		idempotencyKey: text('idempotency_key').notNull(),
		requestJson: text('request_json').notNull(),
		responseJson: text('response_json').notNull(),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		uniqueIndex('mutation_receipt_scope_unique').on(
			table.workspaceId,
			table.actorUserId,
			table.operation,
			table.idempotencyKey
		)
	]
);

export const financialAccountRelations = relations(financialAccount, ({ one, many }) => ({
	workspace: one(workspace, { fields: [financialAccount.workspaceId], references: [workspace.id] }),
	transactions: many(ledgerTransaction)
}));
export const ledgerTransactionRelations = relations(ledgerTransaction, ({ one }) => ({
	account: one(financialAccount, {
		fields: [ledgerTransaction.accountId],
		references: [financialAccount.id]
	})
}));
