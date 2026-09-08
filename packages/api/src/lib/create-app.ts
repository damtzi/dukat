import { OpenAPIHono } from '@hono/zod-openapi';
import { createRequestLogger, notFound, onError, type LogLevel } from '../middleware';
import { requestId } from 'hono/request-id';
import type { AppBindings } from './types';
import { defaultHook } from '../openapi';
import type { APIServices } from '../services';

export function createRouter() {
	return new OpenAPIHono<AppBindings>({
		strict: false,
		defaultHook: defaultHook
	});
}

export default function createApp(services: APIServices, options: { logLevel?: LogLevel } = {}) {
	const app = createRouter();

	// Caller-supplied identifiers can contain personal data. Generate our own log IDs.
	app.use(requestId({ headerName: '' }));
	app.use(createRequestLogger(options.logLevel));
	app.use('*', async (c, next) => {
		c.set('services', services);
		await next();
	});
	app.notFound(notFound);
	app.onError(onError);

	return app;
}
