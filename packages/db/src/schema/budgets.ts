import { sql } from 'drizzle-orm';
import { check, foreignKey, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { int64, ledgerCategory, safeInteger, secondsTimestamp } from './ledger';
import { workspace } from './workspaces';

export const categoryBudget = sqliteTable(
	'category_budget',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		categoryId: text('category_id').notNull(),
		month: text('month').notNull(),
		amountMinor: int64('amount_minor').notNull(),
		reportingCurrency: text('reporting_currency').notNull(),
		version: safeInteger('version').notNull().default(1),
		createdAt: secondsTimestamp('created_at')
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: secondsTimestamp('updated_at')
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(table) => [
		foreignKey({
			columns: [table.workspaceId, table.categoryId],
			foreignColumns: [ledgerCategory.workspaceId, ledgerCategory.id]
		}).onDelete('restrict'),
		uniqueIndex('category_budget_workspace_category_month_unique').on(
			table.workspaceId,
			table.categoryId,
			table.month
		),
		index('category_budget_workspace_month_idx').on(table.workspaceId, table.month),
		check(
			'category_budget_amount_check',
			sql`${table.amountMinor} BETWEEN 1 AND 9223372036854775807`
		),
		check(
			'category_budget_month_check',
			sql`${table.month} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(${table.month}, 6, 2) BETWEEN '01' AND '12'`
		),
		check('category_budget_version_check', sql`${table.version} > 0`)
	]
);
