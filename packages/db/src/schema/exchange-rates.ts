import { sql } from 'drizzle-orm';
import {
	customType,
	index,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import { user } from './auth';
import { workspace } from './workspaces';

const secondsTimestamp = customType<{ data: Date; driverData: bigint }>({
	dataType: () => 'integer',
	toDriver: (value) => BigInt(Math.floor(value.getTime() / 1000)),
	fromDriver: (value) => new Date(Number(value) * 1000)
});

export const exchangeRateTable = sqliteTable(
	'exchange_rate_table',
	{
		source: text('source').notNull(),
		tableType: text('table_type').notNull(),
		tableNumber: text('table_number').notNull(),
		effectiveDate: text('effective_date').notNull(),
		fetchedAt: secondsTimestamp('fetched_at').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.source, table.tableNumber, table.effectiveDate] }),
		index('exchange_rate_table_date_idx').on(table.effectiveDate)
	]
);

export const exchangeRate = sqliteTable(
	'exchange_rate',
	{
		source: text('source').notNull(),
		tableNumber: text('table_number').notNull(),
		effectiveDate: text('effective_date').notNull(),
		currency: text('currency').notNull(),
		rateToPln: text('rate_to_pln').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.source, table.tableNumber, table.effectiveDate, table.currency] }),
		index('exchange_rate_currency_date_idx').on(table.currency, table.effectiveDate)
	]
);

/** Successful NBP requests, including date ranges with no published table. */
export const exchangeRateFetch = sqliteTable(
	'exchange_rate_fetch',
	{
		source: text('source').notNull(),
		requestKey: text('request_key').notNull(),
		fromDate: text('from_date'),
		toDate: text('to_date'),
		fetchedAt: secondsTimestamp('fetched_at').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.source, table.requestKey] }),
		index('exchange_rate_fetch_coverage_idx').on(table.fromDate, table.toDate)
	]
);

export const workspaceManualRate = sqliteTable(
	'workspace_manual_rate',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		currency: text('currency').notNull(),
		rateToPln: text('rate_to_pln').notNull(),
		effectiveDate: text('effective_date').notNull(),
		reason: text('reason').notNull(),
		actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
		actorDisplay: text('actor_display').notNull(),
		removedByUserId: text('removed_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		removedAt: secondsTimestamp('removed_at'),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		uniqueIndex('workspace_manual_rate_point_unique')
			.on(table.workspaceId, table.currency, table.effectiveDate)
			.where(sql`${table.removedAt} IS NULL`),
		index('workspace_manual_rate_lookup_idx').on(
			table.workspaceId,
			table.currency,
			table.effectiveDate,
			table.removedAt
		)
	]
);
