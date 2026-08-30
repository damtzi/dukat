import { createRouter } from '../../lib/create-app';

export const authRouter = createRouter();

authRouter.get('/auth/username-availability', async (c) => {
	const result = await c.var.services.auth.usernameAvailability(c.req.query('username') ?? '');
	c.header('cache-control', 'no-store');
	return c.json(result);
});

authRouter.post('/auth/sign-out', (c) => {
	const headers = new Headers(c.req.raw.headers);
	headers.set('content-type', 'application/json');
	return c.var.services.auth.handler(new Request(c.req.raw, { body: '{}', headers }));
});

authRouter.on(['GET', 'POST'], '/auth/*', (c) => c.var.services.auth.handler(c.req.raw));
