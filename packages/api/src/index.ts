import type { Auth } from '@dukat/auth';
import type { Database } from '@dukat/db';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { z } from 'zod';

import {
	authorizeWorkspace,
	createWorkspaceRepository,
	listAuthorizedWorkspaces
} from './workspaces';

interface CreateApiOptions {
	auth: Auth;
	database: Database;
	logger?: {
		info(data: Record<string, unknown>): void;
		error(data: Record<string, unknown>): void;
	};
}

interface Variables {
	user: { id: string; email: string; name: string };
}

const workspaceNameSchema = z.object({
	name: z.string().trim().min(1).max(100)
});

export function createApi({ auth, database, logger }: CreateApiOptions) {
	const app = new Hono<{ Variables: Variables }>();

	app.use('*', async (context, next) => {
		const startedAt = performance.now();
		const requestId = context.req.header('x-request-id') ?? crypto.randomUUID();
		const logPath = context.req.path.startsWith('/api/auth/') ? '/api/auth/*' : context.req.path;
		context.header('x-request-id', requestId);
		await next();
		logger?.info({
			event: 'http_request',
			requestId,
			method: context.req.method,
			path: logPath,
			status: context.res.status,
			durationMs: Math.round(performance.now() - startedAt)
		});
	});

	app.get('/health/live', (context) => context.json({ status: 'ok' }));
	app.get('/health/ready', async (context) => {
		try {
			await database.run('select 1');
			return context.json({ status: 'ready' });
		} catch {
			return context.json({ status: 'unavailable' }, 503);
		}
	});

	app.on(['GET', 'POST'], '/api/auth/*', (context) => auth.handler(context.req.raw));

	const requireSession: MiddlewareHandler<{ Variables: Variables }> = async (context, next) => {
		const session = await auth.api.getSession({ headers: context.req.raw.headers });
		if (!session) {
			return context.json({ message: 'Authentication required' }, 401);
		}
		context.set('user', session.user);
		await next();
	};
	app.use('/api/workspaces', requireSession);
	app.use('/api/workspaces/*', requireSession);

	app.get('/api/workspaces', async (context) => {
		const workspaces = await listAuthorizedWorkspaces(database, context.var.user.id);
		return context.json({ workspaces });
	});

	app.get('/api/workspaces/:workspaceId', async (context) => {
		const authorization = await authorizeWorkspace(
			database,
			context.var.user.id,
			context.req.param('workspaceId')
		);
		if (!authorization) return context.json({ message: 'Workspace not found' }, 404);
		const result = await createWorkspaceRepository(database, authorization).get();
		return context.json({ workspace: result });
	});

	app.patch('/api/workspaces/:workspaceId', async (context) => {
		const authorization = await authorizeWorkspace(
			database,
			context.var.user.id,
			context.req.param('workspaceId')
		);
		if (!authorization) return context.json({ message: 'Workspace not found' }, 404);
		const body = workspaceNameSchema.safeParse(await context.req.json().catch(() => undefined));
		if (!body.success) {
			return context.json(
				{ message: 'A workspace name between 1 and 100 characters is required' },
				400
			);
		}
		const result = await createWorkspaceRepository(database, authorization).rename(body.data.name);
		if (!result) return context.json({ message: 'Household owner access is required' }, 403);
		return context.json({ workspace: result });
	});

	app.onError((error, context) => {
		logger?.error({
			event: 'http_error',
			path: context.req.path.startsWith('/api/auth/') ? '/api/auth/*' : context.req.path,
			errorType: error.name
		});
		return context.json({ message: 'The request could not be completed' }, 500);
	});

	return app;
}

export type AppType = ReturnType<typeof createApi>;
