import type { MiddlewareHandler } from 'hono';

import type { AppBindings } from '../lib/types';

export const administrator: MiddlewareHandler<AppBindings> = async (c, next) => {
	const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ message: 'Unauthorized' }, 401);
	const status = await c.var.services.auth.accessStatus?.(session.user.id);
	if (!status?.isAdmin || status.disabledAt || status.deletionRequestedAt)
		return c.json({ message: 'Forbidden' }, 403);
	c.set('userId', session.user.id);
	await next();
};
