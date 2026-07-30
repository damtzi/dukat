import type { AppRouteHandler } from '../../lib/types';
import type { GetOneRoute, ListRoute } from './workspaces.routes';

export const list: AppRouteHandler<ListRoute> = async (c) => {
	return c.json(await c.var.services.workspaces.listAuthorized(c.var.userId), 200);
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

	return c.json(workspace, 200);
};
