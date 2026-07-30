import { and, eq, or } from 'drizzle-orm';

import type { Database } from '../connection';
import { workspace, workspaceMembership } from '../schema';

export interface WorkspaceAuthorizationContext {
	userId: string;
	workspaceId: string;
}

export async function listAuthorizedWorkspaces(database: Database, userId: string) {
	return database
		.selectDistinct({
			id: workspace.id,
			name: workspace.name,
			type: workspace.type
		})
		.from(workspace)
		.leftJoin(
			workspaceMembership,
			and(eq(workspaceMembership.workspaceId, workspace.id), eq(workspaceMembership.userId, userId))
		)
		.where(
			or(
				and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, userId)),
				and(eq(workspace.type, 'household'), eq(workspaceMembership.userId, userId))
			)
		);
}

export async function findAuthorizedWorkspace(
	database: Database,
	context: WorkspaceAuthorizationContext
) {
	const [authorizedWorkspace] = await database
		.select({
			id: workspace.id,
			name: workspace.name,
			type: workspace.type
		})
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
				or(
					and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, context.userId)),
					and(eq(workspace.type, 'household'), eq(workspaceMembership.userId, context.userId))
				)
			)
		)
		.limit(1);

	return authorizedWorkspace;
}

export function createWorkspaceRepository(database: Database) {
	return {
		listAuthorized(userId: string) {
			return listAuthorizedWorkspaces(database, userId);
		},
		findAuthorized(context: WorkspaceAuthorizationContext) {
			return findAuthorizedWorkspace(database, context);
		}
	};
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;
