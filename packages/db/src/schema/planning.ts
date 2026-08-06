import { sql } from 'drizzle-orm';
import { check, foreignKey, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { workspace } from './workspaces';
import {
	financialAccount,
	int64,
	ledgerCategory,
	ledgerTransaction,
	safeInteger,
	secondsTimestamp
} from './ledger';

export const plannedSeries = sqliteTable(
	'planned_series',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		rootPlanId: text('root_plan_id').notNull(),
		accountId: text('account_id').notNull(),
		kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
		amountMinor: int64('amount_minor').notNull(),
		date: text('date').notNull(),
		effectiveFrom: text('effective_from').notNull(),
		status: text('status', { enum: ['expected', 'tentative'] }).notNull(),
		description: text('description'),
		categoryId: text('category_id'),
		recurrenceFrequency: text('recurrence_frequency', { enum: ['weekly', 'monthly', 'yearly'] }),
		recurrenceInterval: safeInteger('recurrence_interval'),
		recurrenceEndDate: text('recurrence_end_date'),
		cutoffDate: text('cutoff_date'),
		cancelled: safeInteger('cancelled').notNull().default(0),
		version: safeInteger('version').notNull().default(1),
		createdAt: secondsTimestamp('created_at')
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: secondsTimestamp('updated_at')
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		foreignKey({
			columns: [t.workspaceId, t.accountId],
			foreignColumns: [financialAccount.workspaceId, financialAccount.id]
		}).onDelete('restrict'),
		foreignKey({
			columns: [t.workspaceId, t.categoryId],
			foreignColumns: [ledgerCategory.workspaceId, ledgerCategory.id]
		}).onDelete('restrict'),
		foreignKey({
			columns: [t.workspaceId, t.rootPlanId],
			foreignColumns: [t.workspaceId, t.id]
		}).onDelete('restrict'),
		uniqueIndex('planned_series_workspace_id_unique').on(t.workspaceId, t.id),
		index('planned_series_workspace_root_idx').on(t.workspaceId, t.rootPlanId),
		index('planned_series_workspace_date_idx').on(t.workspaceId, t.date),
		check('planned_series_amount_check', sql`${t.amountMinor} BETWEEN 1 AND 9223372036854775807`),
		check('planned_series_version_check', sql`${t.version} > 0`),
		check('planned_series_kind_check', sql`${t.kind} IN ('income','expense')`),
		check('planned_series_status_check', sql`${t.status} IN ('expected','tentative')`),
		check(
			'planned_series_date_check',
			sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND ${t.effectiveFrom} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND (${t.cutoffDate} IS NULL OR ${t.cutoffDate} >= ${t.effectiveFrom})`
		),
		check(
			'planned_series_recurrence_check',
			sql`(${t.recurrenceFrequency} IS NULL AND ${t.recurrenceInterval} IS NULL AND ${t.recurrenceEndDate} IS NULL) OR (${t.recurrenceFrequency} IN ('weekly','monthly','yearly') AND ${t.recurrenceInterval} > 0 AND (${t.recurrenceEndDate} IS NULL OR ${t.recurrenceEndDate} >= ${t.date}))`
		)
	]
);

export const plannedOccurrenceException = sqliteTable(
	'planned_occurrence_exception',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id').notNull(),
		planId: text('plan_id').notNull(),
		originalDate: text('original_date').notNull(),
		action: text('action', { enum: ['skip', 'change'] }).notNull(),
		changedDate: text('changed_date'),
		changedAmountMinor: int64('changed_amount_minor'),
		changedStatus: text('changed_status', { enum: ['expected', 'tentative'] }),
		createdAt: secondsTimestamp('created_at')
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: secondsTimestamp('updated_at')
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		foreignKey({
			columns: [t.workspaceId, t.planId],
			foreignColumns: [plannedSeries.workspaceId, plannedSeries.id]
		}).onDelete('cascade'),
		uniqueIndex('planned_exception_occurrence_unique').on(t.planId, t.originalDate),
		check('planned_exception_action_check', sql`${t.action} IN ('skip','change')`),
		check(
			'planned_exception_change_check',
			sql`(${t.action}='skip' AND ${t.changedDate} IS NULL AND ${t.changedAmountMinor} IS NULL AND ${t.changedStatus} IS NULL) OR (${t.action}='change' AND (${t.changedDate} IS NOT NULL OR ${t.changedAmountMinor} IS NOT NULL OR ${t.changedStatus} IS NOT NULL))`
		)
	]
);

export const plannedOccurrenceMatch = sqliteTable(
	'planned_occurrence_match',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id').notNull(),
		planId: text('plan_id').notNull(),
		originalDate: text('original_date').notNull(),
		transactionId: text('transaction_id').notNull(),
		createdAt: secondsTimestamp('created_at')
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [
		foreignKey({
			columns: [t.workspaceId, t.planId],
			foreignColumns: [plannedSeries.workspaceId, plannedSeries.id]
		}).onDelete('cascade'),
		foreignKey({
			columns: [t.workspaceId, t.transactionId],
			foreignColumns: [ledgerTransaction.workspaceId, ledgerTransaction.id]
		}).onDelete('cascade'),
		uniqueIndex('planned_match_occurrence_unique').on(t.planId, t.originalDate),
		uniqueIndex('planned_match_transaction_unique').on(t.transactionId)
	]
);
