import type { AppRouteHandler } from '../../lib/types';
import type { CreateRoute, ListRoute, RemoveRoute } from './favorites.routes';

export const list: AppRouteHandler<ListRoute> = async (c) =>
	c.json(await c.var.services.favorites.list(c.var.userId), 200);

export const create: AppRouteHandler<CreateRoute> = async (c) =>
	c.json(await c.var.services.favorites.add(c.var.userId, c.req.valid('json')), 201);

export const remove: AppRouteHandler<RemoveRoute> = async (c) => {
	await c.var.services.favorites.remove(c.var.userId, c.req.valid('param').favoriteId);
	return c.body(null, 204);
};
