import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth';

export const workspace = sqliteTable(
	'workspace',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		type: text('type', { enum: ['personal', 'household'] }).notNull(),
		ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
		createdAt: text('created_at').notNull(),
		updatedAt: text('updated_at').notNull()
	},
	(table) => [
		uniqueIndex('workspace_personal_owner_idx').on(table.ownerUserId),
		check('workspace_type_check', sql`${table.type} IN ('personal', 'household')`),
		check(
			'workspace_owner_check',
			sql`(${table.type} = 'personal' AND ${table.ownerUserId} IS NOT NULL) OR (${table.type} = 'household' AND ${table.ownerUserId} IS NULL)`
		)
	]
);

export const workspaceMember = sqliteTable(
	'workspace_member',
	{
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['member', 'owner'] }).notNull(),
		createdAt: text('created_at').notNull()
	},
	(table) => [
		uniqueIndex('workspace_member_workspace_user_idx').on(table.workspaceId, table.userId),
		index('workspace_member_user_idx').on(table.userId),
		check('workspace_member_role_check', sql`${table.role} IN ('member', 'owner')`)
	]
);
