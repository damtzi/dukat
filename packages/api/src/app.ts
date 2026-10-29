import configureOpenAPI from './lib/configure-open-api';
import createApp from './lib/create-app';
import type { LogLevel } from './middleware';
import { authRouter } from './routes/auth/auth.index';
import { healthRouter } from './routes/health/health.index';
import type { APIServices } from './services';

export function createAPI(services: APIServices, options: { logLevel?: LogLevel } = {}) {
	const app = createApp(services, options);
	configureOpenAPI(app);

	return app.route('/api', authRouter).route('/api', healthRouter);
}

export type APIType = ReturnType<typeof createAPI>;
