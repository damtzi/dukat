import type { MiddlewareHandler } from 'hono';

import type { AppBindings } from '../lib/types';

export const authenticated: MiddlewareHandler<AppBindings> = async (c, next) => {
	const session = await c.var.services.auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) {
		return c.json({ message: 'Unauthorized' }, 401);
	}

	c.set('userId', session.user.id);
	await next();
};
