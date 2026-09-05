import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { user } from './auth';
import { secondsTimestamp } from './ledger';

export const netWorthSnapshot = sqliteTable(
	'net_worth_snapshot',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		payloadJson: text('payload_json').notNull(),
		createdAt: secondsTimestamp('created_at')
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		uniqueIndex('net_worth_snapshot_user_date_unique').on(table.userId, table.date),
		index('net_worth_snapshot_user_date_idx').on(table.userId, table.date)
	]
);
