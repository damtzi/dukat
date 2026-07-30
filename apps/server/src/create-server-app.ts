import { serveStatic } from '@hono/node-server/serve-static';
import { Hono as HonoApp } from 'hono';
import { isAbsolute, join, resolve } from 'node:path';

interface FetchApplication {
	fetch(request: Request): Response | Promise<Response>;
}

export interface CreateServerAppOptions {
	api: FetchApplication;
	dashboardDirectory: string;
}

export function resolveDashboardDirectory(
	directory: string,
	options: { cwd?: string; production?: boolean } = {}
) {
	if (options.production && !isAbsolute(directory)) {
		throw new Error('DASHBOARD_DIRECTORY must be absolute in production');
	}

	return resolve(options.cwd ?? process.cwd(), directory);
}

export function createServerApp({ api, dashboardDirectory }: CreateServerAppOptions) {
	const app = new HonoApp();

	app.use('/api/*', async (c) => api.fetch(c.req.raw));
	app.use('*', serveStatic({ root: dashboardDirectory }));
	app.get('*', serveStatic({ path: join(dashboardDirectory, 'index.html') }));

	return app;
}
