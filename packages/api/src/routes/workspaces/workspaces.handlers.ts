import type { AppRouteHandler } from '../../lib/types';
import type { GetOneRoute, ListRoute } from './workspaces.routes';
import type * as Routes from './workspaces.routes';

const context = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId });
const invitationUrl = (c: { req: { url: string } }) => (token: string) =>
	`${new URL(c.req.url).origin}/workspace-invitations/${token}`;

export const list: AppRouteHandler<ListRoute> = async (c) => {
	const workspaces = await c.var.services.workspaces.listAuthorized(c.var.userId);
	return c.json(
		workspaces.map((workspace) => ({ ...workspace, role: workspace.role ?? null })),
		200
	);
};

export const getOne: AppRouteHandler<GetOneRoute> = async (c) => {
	const { workspaceId } = c.req.valid('param');
	const workspace = await c.var.services.workspaces.findAuthorized({
		userId: c.var.userId,
		workspaceId
	});

	if (!workspace) {
		return c.json({ message: 'Not found' }, 404);
	}

	return c.json({ ...workspace, role: workspace.role ?? null }, 200);
};

export const create: AppRouteHandler<typeof Routes.create> = async (c) =>
	c.json(await c.var.services.workspaces.createHousehold(c.var.userId, c.req.valid('json')), 200);
export const settings: AppRouteHandler<typeof Routes.settings> = async (c) =>
	c.json(await c.var.services.workspaces.updateHousehold(context(c), c.req.valid('json')), 200);
export const members: AppRouteHandler<typeof Routes.members> = async (c) =>
	c.json(await c.var.services.workspaces.listMembers(context(c)), 200);
export const invitations: AppRouteHandler<typeof Routes.invitations> = async (c) =>
	c.json(await c.var.services.workspaces.listInvitations(context(c)), 200);
export const invite: AppRouteHandler<typeof Routes.invite> = async (c) => {
	const result = await c.var.services.workspaces.invite(context(c), {
		...c.req.valid('json'),
		invitationUrl: invitationUrl(c)
	});
	void c.var.services.workspaces.deliverOutbox?.();
	return c.json(result, 200);
};
export const revoke: AppRouteHandler<typeof Routes.revoke> = async (c) => {
	const p = c.req.valid('param');
	return c.json(
		await c.var.services.workspaces.revokeInvitation(context(c), p.id, c.req.valid('json').version),
		200
	);
};
export const resend: AppRouteHandler<typeof Routes.resend> = async (c) => {
	const p = c.req.valid('param');
	const result = await c.var.services.workspaces.resendInvitation(context(c), p.id, {
		...c.req.valid('json'),
		invitationUrl: invitationUrl(c)
	});
	void c.var.services.workspaces.deliverOutbox?.();
	return c.json(result, 200);
};
export const accept: AppRouteHandler<typeof Routes.accept> = async (c) => {
	const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
	if (!session?.user.emailVerified) return c.json({ message: 'Verified email required' }, 400);
	return c.json(
		await c.var.services.workspaces.acceptInvitation(
			session.user.id,
			session.user.email,
			c.req.valid('param').token
		),
		200
	);
};
export const memberAction: AppRouteHandler<typeof Routes.memberAction> = async (c) => {
	const p = c.req.valid('param');
	return c.json(
		await c.var.services.workspaces.changeMember(context(c), p.userId, {
			action: p.action,
			version: c.req.valid('json').version
		}),
		200
	);
};
export const leave: AppRouteHandler<typeof Routes.leave> = async (c) =>
	c.json(
		await c.var.services.workspaces.leaveHousehold(context(c), c.req.valid('json').version),
		200
	);
export const remove: AppRouteHandler<typeof Routes.remove> = async (c) => {
	const body = c.req.valid('json');
	const found = await c.var.services.workspaces.findAuthorized(context(c));
	if (!found) return c.json({ message: 'Not found' }, 404);
	if (body.confirmation !== found.name)
		return c.json({ message: 'Household name confirmation does not match' }, 400);
	await c.var.services.auth.api.verifyPassword({
		body: { password: body.password },
		headers: c.req.raw.headers
	});
	return c.json(
		await c.var.services.workspaces.deleteHousehold(context(c), {
			version: body.version,
			idempotencyKey: body.idempotencyKey
		}),
		200
	);
};
export const recoverable: AppRouteHandler<typeof Routes.recoverable> = async (c) =>
	c.json(await c.var.services.workspaces.listRecoverable(c.var.userId), 200);
export const restore: AppRouteHandler<typeof Routes.restore> = async (c) =>
	c.json(
		await c.var.services.workspaces.restoreHousehold(context(c), c.req.valid('json').version),
		200
	);
export const deletionPreflight: AppRouteHandler<typeof Routes.deletionPreflight> = async (c) =>
	c.json(
		{ blockingHouseholds: await c.var.services.workspaces.accountDeletionPreflight(c.var.userId) },
		200
	);
export const deleteAccount: AppRouteHandler<typeof Routes.deleteAccount> = async (c) => {
	const body = c.req.valid('json');
	await c.var.services.auth.api.verifyPassword({
		body: { password: body.password },
		headers: c.req.raw.headers
	});
	await c.var.services.workspaces.deleteAccount(c.var.userId);
	return c.json({ deleted: true }, 200);
};
