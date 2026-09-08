import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const operationalJob = sqliteTable(
	'operational_job',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		scheduledFor: text('scheduled_for').notNull(),
		status: text('status', { enum: ['running', 'succeeded', 'failed'] }).notNull(),
		attempts: integer('attempts').default(1).notNull(),
		startedAt: integer('started_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp' }),
		errorCode: text('error_code')
	},
	(table) => [
		uniqueIndex('operational_job_name_schedule_unique').on(table.name, table.scheduledFor),
		index('operational_job_started_at_idx').on(table.startedAt),
		check(
			'operational_job_status_check',
			sql`${table.status} IN ('running', 'succeeded', 'failed')`
		)
	]
);
