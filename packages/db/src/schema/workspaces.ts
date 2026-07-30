import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { user } from './auth';

export const workspace = sqliteTable(
	'workspace',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		type: text('type', { enum: ['personal', 'household'] }).notNull(),
		personalOwnerUserId: text('personal_owner_user_id').references(() => user.id, {
			onDelete: 'cascade'
		}),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		uniqueIndex('workspace_personal_owner_unique').on(table.personalOwnerUserId),
		check(
			'workspace_personal_owner_check',
			sql`(${table.type} = 'personal' AND ${table.personalOwnerUserId} IS NOT NULL) OR (${table.type} = 'household' AND ${table.personalOwnerUserId} IS NULL)`
		)
	]
);

export const workspaceMembership = sqliteTable(
	'workspace_membership',
	{
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role', { enum: ['member', 'owner'] }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		uniqueIndex('workspace_membership_workspace_user_unique').on(table.workspaceId, table.userId),
		index('workspace_membership_user_idx').on(table.userId)
	]
);

export const workspaceRelations = relations(workspace, ({ one, many }) => ({
	personalOwner: one(user, {
		fields: [workspace.personalOwnerUserId],
		references: [user.id]
	}),
	memberships: many(workspaceMembership)
}));

export const workspaceMembershipRelations = relations(workspaceMembership, ({ one }) => ({
	workspace: one(workspace, {
		fields: [workspaceMembership.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceMembership.userId],
		references: [user.id]
	})
}));
