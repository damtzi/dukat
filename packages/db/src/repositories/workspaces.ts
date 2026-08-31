import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { supportedCurrencySchema } from '@dukat/core/exchange-rates';

import type { Database } from '../connection';
import {
	emailOutbox,
	mutationReceipt,
	user,
	workspace,
	workspaceAudit,
	workspaceInvitation,
	workspaceMembership
} from '../schema';

export interface WorkspaceAuthorizationContext {
	userId: string;
	workspaceId: string;
}
export class WorkspaceError extends Error {
	constructor(
		public readonly code: 'not_found' | 'conflict' | 'invalid',
		message: string
	) {
		super(message);
	}
}
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const tokenHash = async (token: string) =>
	Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString(
		'hex'
	);
const summary = {
	id: workspace.id,
	name: workspace.name,
	type: workspace.type,
	reportingCurrency: workspace.reportingCurrency,
	version: workspace.version,
	role: workspaceMembership.role
};

export async function listAuthorizedWorkspaces(database: Database, userId: string) {
	return database
		.selectDistinct(summary)
		.from(workspace)
		.leftJoin(
			workspaceMembership,
			and(eq(workspaceMembership.workspaceId, workspace.id), eq(workspaceMembership.userId, userId))
		)
		.where(
			and(
				isNull(workspace.deletedAt),
				or(
					and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, userId)),
					and(eq(workspace.type, 'household'), eq(workspaceMembership.userId, userId))
				)
			)
		);
}
export async function findAuthorizedWorkspace(
	database: Database,
	context: WorkspaceAuthorizationContext
) {
	const [row] = await database
		.select(summary)
		.from(workspace)
		.leftJoin(
			workspaceMembership,
			and(
				eq(workspaceMembership.workspaceId, workspace.id),
				eq(workspaceMembership.userId, context.userId)
			)
		)
		.where(
			and(
				eq(workspace.id, context.workspaceId),
				isNull(workspace.deletedAt),
				or(
					and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, context.userId)),
					and(eq(workspace.type, 'household'), eq(workspaceMembership.userId, context.userId))
				)
			)
		)
		.limit(1);
	return row;
}

export function findSoleOwnerBlockers(database: Database, userId: string) {
	return database
		.select({ id: workspace.id, name: workspace.name })
		.from(workspaceMembership)
		.innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
		.where(
			and(
				eq(workspaceMembership.userId, userId),
				eq(workspaceMembership.role, 'owner'),
				sql`EXISTS (SELECT 1 FROM workspace_membership m WHERE m.workspace_id = ${workspace.id} AND m.user_id <> ${userId})`,
				sql`NOT EXISTS (SELECT 1 FROM workspace_membership o WHERE o.workspace_id = ${workspace.id} AND o.role = 'owner' AND o.user_id <> ${userId})`
			)
		);
}

export function createWorkspaceRepository(database: Database) {
	type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
	const owner = async (tx: Tx, userId: string, workspaceId: string, deleted = false) => {
		const [row] = await tx
			.select({ version: workspace.version })
			.from(workspace)
			.innerJoin(
				workspaceMembership,
				and(
					eq(workspaceMembership.workspaceId, workspace.id),
					eq(workspaceMembership.userId, userId),
					eq(workspaceMembership.role, 'owner')
				)
			)
			.where(
				and(
					eq(workspace.id, workspaceId),
					eq(workspace.type, 'household'),
					deleted ? sql`${workspace.deletedAt} IS NOT NULL` : isNull(workspace.deletedAt)
				)
			)
			.limit(1);
		if (!row) throw new WorkspaceError('not_found', 'Workspace not found');
		return row;
	};
	const bump = async (
		tx: Tx,
		workspaceId: string,
		version: number,
		values: Partial<typeof workspace.$inferInsert> = {}
	) => {
		const changed = await tx
			.update(workspace)
			.set({ ...values, version: version + 1, updatedAt: new Date() })
			.where(and(eq(workspace.id, workspaceId), eq(workspace.version, version)))
			.returning({ version: workspace.version });
		if (!changed.length) throw new WorkspaceError('conflict', 'Workspace changed concurrently');
		return changed[0].version;
	};
	const audit = (
		tx: Tx,
		workspaceId: string,
		actorUserId: string,
		action: string,
		targetUserId?: string
	) =>
		tx
			.insert(workspaceAudit)
			.values({ id: crypto.randomUUID(), workspaceId, actorUserId, action, targetUserId });
	return {
		listAuthorized: (userId: string) => listAuthorizedWorkspaces(database, userId),
		findAuthorized: (context: WorkspaceAuthorizationContext) =>
			findAuthorizedWorkspace(database, context),
		createHousehold(userId: string, input: { name: string; reportingCurrency: string }) {
			if (!supportedCurrencySchema.safeParse(input.reportingCurrency).success)
				throw new WorkspaceError(
					'invalid',
					'Reporting currency must be PLN or an NBP Table A currency'
				);
			return database.transaction(async (tx) => {
				const id = crypto.randomUUID();
				await tx.insert(workspace).values({
					id,
					name: input.name,
					type: 'household',
					reportingCurrency: input.reportingCurrency.toUpperCase()
				});
				await tx.insert(workspaceMembership).values({ workspaceId: id, userId, role: 'owner' });
				await audit(tx, id, userId, 'household.created');
				return {
					id,
					name: input.name,
					type: 'household' as const,
					reportingCurrency: input.reportingCurrency.toUpperCase(),
					version: 1,
					role: 'owner' as const
				};
			});
		},
		updateHousehold(
			context: WorkspaceAuthorizationContext,
			input: { name?: string; reportingCurrency?: string; version: number }
		) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				const [before] = await tx
					.select({ reportingCurrency: workspace.reportingCurrency })
					.from(workspace)
					.where(eq(workspace.id, context.workspaceId));
				const requestedCurrency = input.reportingCurrency?.toUpperCase();
				if (
					requestedCurrency &&
					requestedCurrency !== before.reportingCurrency &&
					!supportedCurrencySchema.safeParse(requestedCurrency).success
				)
					throw new WorkspaceError(
						'invalid',
						'New reporting currency must be PLN or a current NBP Table A currency'
					);
				const version = await bump(tx, context.workspaceId, input.version, {
					name: input.name,
					reportingCurrency: requestedCurrency
				});
				await audit(tx, context.workspaceId, context.userId, 'household.updated');
				return { version };
			});
		},
		listMembers(context: WorkspaceAuthorizationContext) {
			return database.transaction(async (tx) => {
				const [found] = await tx
					.select({ id: workspace.id })
					.from(workspace)
					.innerJoin(
						workspaceMembership,
						and(
							eq(workspaceMembership.workspaceId, workspace.id),
							eq(workspaceMembership.userId, context.userId)
						)
					)
					.where(
						and(
							eq(workspace.id, context.workspaceId),
							eq(workspace.type, 'household'),
							isNull(workspace.deletedAt)
						)
					)
					.limit(1);
				if (!found) throw new WorkspaceError('not_found', 'Workspace not found');
				return tx
					.select({
						userId: user.id,
						name: user.name,
						username: user.username,
						image: user.image,
						role: workspaceMembership.role,
						joinedAt: workspaceMembership.createdAt
					})
					.from(workspaceMembership)
					.innerJoin(user, eq(user.id, workspaceMembership.userId))
					.where(eq(workspaceMembership.workspaceId, context.workspaceId));
			});
		},
		invite(
			context: WorkspaceAuthorizationContext,
			input: { email: string; version: number; invitationUrl(token: string): string }
		) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				const token = crypto.randomUUID() + crypto.randomUUID();
				const id = crypto.randomUUID();
				const email = normalizeEmail(input.email);
				const expiresAt = new Date(Date.now() + 7 * 86400_000);
				const [existingMember] = await tx
					.select({ id: user.id })
					.from(user)
					.innerJoin(workspaceMembership, eq(workspaceMembership.userId, user.id))
					.where(
						and(
							eq(workspaceMembership.workspaceId, context.workspaceId),
							sql`lower(${user.email}) = ${email}`
						)
					)
					.limit(1);
				const [live] = await tx
					.select({ id: workspaceInvitation.id })
					.from(workspaceInvitation)
					.where(
						and(
							eq(workspaceInvitation.workspaceId, context.workspaceId),
							eq(workspaceInvitation.emailNormalized, email),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, new Date())
						)
					)
					.limit(1);
				if (existingMember || live)
					throw new WorkspaceError('conflict', 'Email is already a member or invited');
				await tx.insert(workspaceInvitation).values({
					id,
					workspaceId: context.workspaceId,
					emailNormalized: email,
					tokenHash: await tokenHash(token),
					inviterUserId: context.userId,
					expiresAt
				});
				await tx.insert(emailOutbox).values({
					id: crypto.randomUUID(),
					invitationId: id,
					to: email,
					subject: 'Invitation to a Dukat household',
					body: `Accept your invitation: ${input.invitationUrl(token)}`
				});
				await bump(tx, context.workspaceId, input.version);
				await audit(tx, context.workspaceId, context.userId, 'invitation.created');
				return { id, email, expiresAt };
			});
		},
		listInvitations(context: WorkspaceAuthorizationContext) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				return tx
					.select({
						id: workspaceInvitation.id,
						email: workspaceInvitation.emailNormalized,
						generation: workspaceInvitation.generation,
						expiresAt: workspaceInvitation.expiresAt,
						createdAt: workspaceInvitation.createdAt
					})
					.from(workspaceInvitation)
					.where(
						and(
							eq(workspaceInvitation.workspaceId, context.workspaceId),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, new Date())
						)
					);
			});
		},
		revokeInvitation(
			context: WorkspaceAuthorizationContext,
			invitationId: string,
			version: number
		) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				const changed = await tx
					.update(workspaceInvitation)
					.set({ revokedAt: new Date() })
					.where(
						and(
							eq(workspaceInvitation.id, invitationId),
							eq(workspaceInvitation.workspaceId, context.workspaceId),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt)
						)
					)
					.returning({ id: workspaceInvitation.id });
				if (!changed.length) throw new WorkspaceError('not_found', 'Invitation not found');
				await tx
					.update(emailOutbox)
					.set({ body: null })
					.where(and(eq(emailOutbox.invitationId, invitationId), isNull(emailOutbox.sentAt)));
				await bump(tx, context.workspaceId, version);
				await audit(tx, context.workspaceId, context.userId, 'invitation.revoked');
			});
		},
		resendInvitation(
			context: WorkspaceAuthorizationContext,
			invitationId: string,
			input: { version: number; invitationUrl(token: string): string }
		) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				const [old] = await tx
					.select()
					.from(workspaceInvitation)
					.where(
						and(
							eq(workspaceInvitation.id, invitationId),
							eq(workspaceInvitation.workspaceId, context.workspaceId),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, new Date())
						)
					)
					.limit(1);
				if (!old) throw new WorkspaceError('not_found', 'Invitation not found');
				const now = new Date();
				await tx
					.update(workspaceInvitation)
					.set({ revokedAt: now })
					.where(eq(workspaceInvitation.id, old.id));
				await tx
					.update(emailOutbox)
					.set({ body: null })
					.where(and(eq(emailOutbox.invitationId, old.id), isNull(emailOutbox.sentAt)));
				const token = crypto.randomUUID() + crypto.randomUUID();
				const id = crypto.randomUUID();
				const expiresAt = new Date(Date.now() + 7 * 86400_000);
				await tx.insert(workspaceInvitation).values({
					id,
					workspaceId: context.workspaceId,
					emailNormalized: old.emailNormalized,
					tokenHash: await tokenHash(token),
					inviterUserId: context.userId,
					generation: old.generation + 1,
					resendsInvitationId: old.id,
					expiresAt
				});
				await tx.insert(emailOutbox).values({
					id: crypto.randomUUID(),
					invitationId: id,
					to: old.emailNormalized,
					subject: 'Invitation to a Dukat household',
					body: `Accept your invitation: ${input.invitationUrl(token)}`
				});
				await bump(tx, context.workspaceId, input.version);
				await audit(tx, context.workspaceId, context.userId, 'invitation.resent');
				return { id, email: old.emailNormalized, generation: old.generation + 1, expiresAt };
			});
		},
		acceptInvitation(userId: string, verifiedEmail: string, token: string) {
			return database.transaction(async (tx) => {
				const hash = await tokenHash(token);
				const now = new Date();
				const [invite] = await tx
					.select()
					.from(workspaceInvitation)
					.where(
						and(
							eq(workspaceInvitation.tokenHash, hash),
							eq(workspaceInvitation.emailNormalized, normalizeEmail(verifiedEmail)),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, now)
						)
					)
					.limit(1);
				if (!invite) throw new WorkspaceError('not_found', 'Invitation not found');
				const claimed = await tx
					.update(workspaceInvitation)
					.set({ acceptedAt: now, acceptedByUserId: userId })
					.where(
						and(
							eq(workspaceInvitation.id, invite.id),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt)
						)
					)
					.returning();
				if (!claimed.length) throw new WorkspaceError('conflict', 'Invitation was already used');
				await tx
					.update(emailOutbox)
					.set({ body: null })
					.where(and(eq(emailOutbox.invitationId, invite.id), isNull(emailOutbox.sentAt)));
				await tx
					.insert(workspaceMembership)
					.values({ workspaceId: invite.workspaceId, userId, role: 'member' })
					.onConflictDoNothing();
				const [w] = await tx
					.select({ version: workspace.version })
					.from(workspace)
					.where(and(eq(workspace.id, invite.workspaceId), isNull(workspace.deletedAt)));
				if (!w) throw new WorkspaceError('not_found', 'Invitation not found');
				await bump(tx, invite.workspaceId, w.version);
				await audit(tx, invite.workspaceId, userId, 'invitation.accepted', userId);
				return { workspaceId: invite.workspaceId };
			});
		},
		changeMember(
			context: WorkspaceAuthorizationContext,
			targetUserId: string,
			input: { action: 'promote' | 'demote' | 'remove'; version: number }
		) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId);
				const [target] = await tx
					.select()
					.from(workspaceMembership)
					.where(
						and(
							eq(workspaceMembership.workspaceId, context.workspaceId),
							eq(workspaceMembership.userId, targetUserId)
						)
					);
				if (!target) throw new WorkspaceError('not_found', 'Member not found');
				if (target.role === 'owner' && input.action !== 'promote') {
					const [{ count }] = await tx
						.select({ count: sql<number>`count(*)` })
						.from(workspaceMembership)
						.where(
							and(
								eq(workspaceMembership.workspaceId, context.workspaceId),
								eq(workspaceMembership.role, 'owner')
							)
						);
					if (Number(count) <= 1)
						throw new WorkspaceError('conflict', 'A household with members must retain an owner');
				}
				if (input.action === 'remove')
					await tx
						.delete(workspaceMembership)
						.where(
							and(
								eq(workspaceMembership.workspaceId, context.workspaceId),
								eq(workspaceMembership.userId, targetUserId)
							)
						);
				else
					await tx
						.update(workspaceMembership)
						.set({ role: input.action === 'promote' ? 'owner' : 'member' })
						.where(
							and(
								eq(workspaceMembership.workspaceId, context.workspaceId),
								eq(workspaceMembership.userId, targetUserId)
							)
						);
				await bump(tx, context.workspaceId, input.version);
				await audit(
					tx,
					context.workspaceId,
					context.userId,
					`member.${input.action}`,
					targetUserId
				);
			});
		},
		leaveHousehold(context: WorkspaceAuthorizationContext, version: number) {
			return database.transaction(async (tx) => {
				const [member] = await tx
					.select()
					.from(workspaceMembership)
					.innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
					.where(
						and(
							eq(workspaceMembership.workspaceId, context.workspaceId),
							eq(workspaceMembership.userId, context.userId),
							eq(workspace.type, 'household'),
							isNull(workspace.deletedAt)
						)
					)
					.limit(1);
				if (!member) throw new WorkspaceError('not_found', 'Workspace not found');
				if (member.workspace_membership.role === 'owner') {
					const [{ count }] = await tx
						.select({ count: sql<number>`count(*)` })
						.from(workspaceMembership)
						.where(
							and(
								eq(workspaceMembership.workspaceId, context.workspaceId),
								eq(workspaceMembership.role, 'owner')
							)
						);
					if (Number(count) <= 1)
						throw new WorkspaceError('conflict', 'Another owner is required before leaving');
				}
				await bump(tx, context.workspaceId, version);
				await audit(tx, context.workspaceId, context.userId, 'member.left', context.userId);
				await tx
					.delete(workspaceMembership)
					.where(
						and(
							eq(workspaceMembership.workspaceId, context.workspaceId),
							eq(workspaceMembership.userId, context.userId)
						)
					);
			});
		},
		accountDeletionPreflight(userId: string) {
			return findSoleOwnerBlockers(database, userId);
		},
		async deleteAccount(userId: string) {
			try {
				const deleted = await database
					.delete(user)
					.where(eq(user.id, userId))
					.returning({ id: user.id });
				if (!deleted.length) throw new WorkspaceError('not_found', 'Account not found');
			} catch (error) {
				if (error instanceof WorkspaceError) throw error;
				let cause: unknown = error;
				while (cause instanceof Error && !cause.message.includes('account deletion blocked')) {
					cause = (cause as Error & { cause?: unknown }).cause;
				}
				if (cause instanceof Error) {
					throw new WorkspaceError(
						'conflict',
						'Transfer household ownership before deleting your account'
					);
				}
				throw error;
			}
		},
		async claimPendingOutbox() {
			return database.transaction(async (tx) => {
				const now = new Date();
				const [result] = await tx
					.select({ outbox: emailOutbox })
					.from(emailOutbox)
					.innerJoin(workspaceInvitation, eq(workspaceInvitation.id, emailOutbox.invitationId))
					.where(
						and(
							isNull(emailOutbox.sentAt),
							lte(emailOutbox.nextAttemptAt, now),
							sql`${emailOutbox.body} IS NOT NULL`,
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, now)
						)
					)
					.limit(1);
				const row = result?.outbox;
				if (!row) return undefined;
				const claimed = await tx
					.update(emailOutbox)
					.set({ attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + 5 * 60_000) })
					.where(
						and(
							eq(emailOutbox.id, row.id),
							eq(emailOutbox.attempts, row.attempts),
							lte(emailOutbox.nextAttemptAt, now)
						)
					)
					.returning();
				return claimed[0];
			});
		},
		async isOutboxClaimActive(id: string, attempts: number) {
			const now = new Date();
			return database.transaction(async (tx) => {
				const [active] = await tx
					.select({ id: emailOutbox.id, createdAt: emailOutbox.createdAt })
					.from(emailOutbox)
					.innerJoin(workspaceInvitation, eq(workspaceInvitation.id, emailOutbox.invitationId))
					.where(
						and(
							eq(emailOutbox.id, id),
							eq(emailOutbox.attempts, attempts),
							isNull(emailOutbox.sentAt),
							sql`${emailOutbox.body} IS NOT NULL`,
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt),
							gt(workspaceInvitation.expiresAt, now)
						)
					)
					.limit(1);
				if (!active) return { active: false, terminal: false };
				if (now.getTime() < active.createdAt.getTime() + 23 * 60 * 60_000) {
					return { active: true, terminal: false };
				}
				await tx
					.update(emailOutbox)
					.set({ body: null })
					.where(
						and(
							eq(emailOutbox.id, id),
							eq(emailOutbox.attempts, attempts),
							isNull(emailOutbox.sentAt),
							sql`${emailOutbox.body} IS NOT NULL`
						)
					);
				return { active: false, terminal: true };
			});
		},
		markOutboxSent(id: string, attempts: number) {
			return database
				.update(emailOutbox)
				.set({ sentAt: new Date(), body: null })
				.where(
					and(
						eq(emailOutbox.id, id),
						eq(emailOutbox.attempts, attempts),
						isNull(emailOutbox.sentAt),
						sql`${emailOutbox.body} IS NOT NULL`
					)
				);
		},
		markOutboxFailed(id: string, attempts: number) {
			return database.transaction(async (tx) => {
				const [claimed] = await tx
					.select({ createdAt: emailOutbox.createdAt })
					.from(emailOutbox)
					.where(
						and(
							eq(emailOutbox.id, id),
							eq(emailOutbox.attempts, attempts),
							isNull(emailOutbox.sentAt),
							sql`${emailOutbox.body} IS NOT NULL`
						)
					)
					.limit(1);
				if (!claimed) return { terminal: false };
				const retryAt = new Date(Date.now() + Math.min(86400_000, 1000 * 2 ** attempts));
				const terminal = retryAt.getTime() >= claimed.createdAt.getTime() + 23 * 60 * 60_000;
				await tx
					.update(emailOutbox)
					.set(terminal ? { body: null } : { nextAttemptAt: retryAt })
					.where(
						and(
							eq(emailOutbox.id, id),
							eq(emailOutbox.attempts, attempts),
							isNull(emailOutbox.sentAt),
							sql`${emailOutbox.body} IS NOT NULL`
						)
					);
				return { terminal };
			});
		},
		deleteHousehold(
			context: WorkspaceAuthorizationContext,
			input: { version: number; idempotencyKey?: string }
		) {
			return database.transaction(async (tx) => {
				if (input.idempotencyKey) {
					const [receipt] = await tx
						.select({ id: mutationReceipt.id })
						.from(mutationReceipt)
						.where(
							and(
								eq(mutationReceipt.workspaceId, context.workspaceId),
								eq(mutationReceipt.actorUserId, context.userId),
								eq(mutationReceipt.operation, 'household.delete'),
								eq(mutationReceipt.idempotencyKey, input.idempotencyKey)
							)
						)
						.limit(1);
					if (receipt) return;
				}
				await owner(tx, context.userId, context.workspaceId);
				await bump(tx, context.workspaceId, input.version, { deletedAt: new Date() });
				await tx
					.update(workspaceInvitation)
					.set({ revokedAt: new Date() })
					.where(
						and(
							eq(workspaceInvitation.workspaceId, context.workspaceId),
							isNull(workspaceInvitation.acceptedAt),
							isNull(workspaceInvitation.revokedAt)
						)
					);
				await tx
					.update(emailOutbox)
					.set({ body: null })
					.where(
						and(
							isNull(emailOutbox.sentAt),
							sql`${emailOutbox.invitationId} IN (SELECT id FROM workspace_invitation WHERE workspace_id = ${context.workspaceId})`
						)
					);
				await audit(tx, context.workspaceId, context.userId, 'household.deleted');
				if (input.idempotencyKey)
					await tx.insert(mutationReceipt).values({
						id: crypto.randomUUID(),
						workspaceId: context.workspaceId,
						actorUserId: context.userId,
						operation: 'household.delete',
						idempotencyKey: input.idempotencyKey,
						requestJson: JSON.stringify({ version: input.version }),
						responseJson: '{}'
					});
			});
		},
		listRecoverable(userId: string) {
			const cutoff = new Date(Date.now() - 30 * 86400_000);
			return database
				.select(summary)
				.from(workspace)
				.innerJoin(
					workspaceMembership,
					and(
						eq(workspaceMembership.workspaceId, workspace.id),
						eq(workspaceMembership.userId, userId),
						eq(workspaceMembership.role, 'owner')
					)
				)
				.where(and(eq(workspace.type, 'household'), gt(workspace.deletedAt, cutoff)));
		},
		restoreHousehold(context: WorkspaceAuthorizationContext, version: number) {
			return database.transaction(async (tx) => {
				await owner(tx, context.userId, context.workspaceId, true);
				const cutoff = new Date(Date.now() - 30 * 86400_000);
				const changed = await tx
					.update(workspace)
					.set({ deletedAt: null, version: version + 1 })
					.where(
						and(
							eq(workspace.id, context.workspaceId),
							eq(workspace.version, version),
							gt(workspace.deletedAt, cutoff)
						)
					)
					.returning();
				if (!changed.length) throw new WorkspaceError('not_found', 'Workspace not found');
				await audit(tx, context.workspaceId, context.userId, 'household.restored');
			});
		},
		purgeExpired() {
			const cutoff = new Date(Date.now() - 30 * 86400_000);
			return database
				.delete(workspace)
				.where(and(eq(workspace.type, 'household'), lte(workspace.deletedAt, cutoff)))
				.returning({ id: workspace.id });
		}
	};
}
export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
