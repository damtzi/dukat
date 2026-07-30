import configureOpenAPI from './lib/configure-open-api';
import createApp from './lib/create-app';
import { authRouter } from './routes/auth/auth.index';
import { healthRouter } from './routes/health/health.index';
import { workspacesRouter } from './routes/workspaces/workspaces.index';
import type { APIServices } from './services';

export function createAPI(services: APIServices) {
	const app = createApp(services);
	configureOpenAPI(app);

	return app.route('/api', authRouter).route('/api', healthRouter).route('/api', workspacesRouter);
}

export type APIType = ReturnType<typeof createAPI>;
