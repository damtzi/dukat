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
		reportingCurrency: text('reporting_currency'),
		version: integer('version').default(1).notNull(),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
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
		index('workspace_deleted_at_idx').on(table.deletedAt),
		check('workspace_version_check', sql`${table.version} > 0`),
		check(
			'workspace_personal_owner_check',
			sql`(${table.type} = 'personal' AND ${table.personalOwnerUserId} IS NOT NULL) OR (${table.type} = 'household' AND ${table.personalOwnerUserId} IS NULL)`
		)
	]
);

export const workspaceInvitation = sqliteTable(
	'workspace_invitation',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		emailNormalized: text('email_normalized').notNull(),
		tokenHash: text('token_hash').notNull(),
		inviterUserId: text('inviter_user_id').references(() => user.id, { onDelete: 'set null' }),
		generation: integer('generation').default(1).notNull(),
		resendsInvitationId: text('resends_invitation_id'),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
		acceptedByUserId: text('accepted_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		revokedAt: integer('revoked_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [
		uniqueIndex('workspace_invitation_token_unique').on(table.tokenHash),
		index('workspace_invitation_workspace_idx').on(table.workspaceId),
		index('workspace_invitation_email_idx').on(table.emailNormalized)
	]
);

export const emailOutbox = sqliteTable(
	'email_outbox',
	{
		id: text('id').primaryKey(),
		invitationId: text('invitation_id')
			.notNull()
			.references(() => workspaceInvitation.id, { onDelete: 'cascade' }),
		to: text('to').notNull(),
		subject: text('subject').notNull(),
		body: text('body'),
		attempts: integer('attempts').default(0).notNull(),
		nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull(),
		sentAt: integer('sent_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [index('email_outbox_delivery_idx').on(table.sentAt, table.nextAttemptAt)]
);

export const workspaceAudit = sqliteTable(
	'workspace_audit',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		actorUserId: text('actor_user_id'),
		action: text('action').notNull(),
		targetUserId: text('target_user_id'),
		detailsJson: text('details_json'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.default(sql`(unixepoch())`)
			.notNull()
	},
	(table) => [index('workspace_audit_workspace_idx').on(table.workspaceId, table.createdAt)]
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
