import { sql } from 'drizzle-orm';
import { check, foreignKey, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { financialAccount, int64, safeInteger } from './ledger';
import { workspace } from './workspaces';

export const mortgage = sqliteTable(
	'mortgage',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		paymentAccountId: text('payment_account_id').notNull(),
		originalPrincipalMinor: int64('original_principal_minor').notNull(),
		currentBalanceMinor: int64('current_balance_minor').notNull(),
		startDate: text('start_date').notNull(),
		termMonths: safeInteger('term_months').notNull(),
		interestType: text('interest_type', { enum: ['fixed', 'variable'] }).notNull(),
		annualRateBasisPoints: safeInteger('annual_rate_basis_points').notNull(),
		scheduleJson: text('schedule_json').notNull()
	},
	(table) => [
		uniqueIndex('mortgage_workspace_unique').on(table.workspaceId),
		index('mortgage_payment_account_idx').on(table.paymentAccountId),
		foreignKey({
			columns: [table.workspaceId, table.paymentAccountId],
			foreignColumns: [financialAccount.workspaceId, financialAccount.id]
		}),
		check(
			'mortgage_balance_check',
			sql`${table.originalPrincipalMinor} > 0 AND ${table.currentBalanceMinor} > 0 AND ${table.currentBalanceMinor} <= ${table.originalPrincipalMinor}`
		),
		check('mortgage_term_check', sql`${table.termMonths} BETWEEN 1 AND 600`),
		check('mortgage_rate_check', sql`${table.annualRateBasisPoints} BETWEEN 0 AND 10000`),
		check('mortgage_interest_type_check', sql`${table.interestType} IN ('fixed', 'variable')`)
	]
);
