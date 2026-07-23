import { type Database, workspace, workspaceMember } from '@dukat/db';
import { and, eq, exists, or } from 'drizzle-orm';

export interface WorkspaceAuthorizationContext {
	userId: string;
	workspaceId: string;
}

const publicWorkspace = {
	id: workspace.id,
	name: workspace.name,
	type: workspace.type
};

export async function listAuthorizedWorkspaces(database: Database, userId: string) {
	return database
		.selectDistinct(publicWorkspace)
		.from(workspace)
		.leftJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
		.where(or(eq(workspace.ownerUserId, userId), eq(workspaceMember.userId, userId)));
}

export async function authorizeWorkspace(
	database: Database,
	userId: string,
	workspaceId: string
): Promise<WorkspaceAuthorizationContext | null> {
	const [authorized] = await database
		.select({ id: workspace.id })
		.from(workspace)
		.leftJoin(workspaceMember, eq(workspaceMember.workspaceId, workspace.id))
		.where(
			and(
				eq(workspace.id, workspaceId),
				or(eq(workspace.ownerUserId, userId), eq(workspaceMember.userId, userId))
			)
		)
		.limit(1);

	return authorized ? { userId, workspaceId } : null;
}

export function createWorkspaceRepository(
	database: Database,
	authorization: WorkspaceAuthorizationContext
) {
	const membership = (ownerOnly: boolean) =>
		exists(
			database
				.select({ userId: workspaceMember.userId })
				.from(workspaceMember)
				.where(
					and(
						eq(workspaceMember.workspaceId, workspace.id),
						eq(workspaceMember.userId, authorization.userId),
						...(ownerOnly ? [eq(workspaceMember.role, 'owner')] : [])
					)
				)
		);
	const authorizedWorkspace = and(
		eq(workspace.id, authorization.workspaceId),
		or(eq(workspace.ownerUserId, authorization.userId), membership(false))
	);
	const manageableWorkspace = and(
		eq(workspace.id, authorization.workspaceId),
		or(eq(workspace.ownerUserId, authorization.userId), membership(true))
	);

	return {
		async get() {
			const [result] = await database
				.select(publicWorkspace)
				.from(workspace)
				.where(authorizedWorkspace)
				.limit(1);
			return result;
		},
		async rename(name: string) {
			const [result] = await database
				.update(workspace)
				.set({ name, updatedAt: new Date().toISOString() })
				.where(manageableWorkspace)
				.returning(publicWorkspace);
			return result;
		}
	};
}
