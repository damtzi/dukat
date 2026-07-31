import { OpenAPIHono } from '@hono/zod-openapi';
import { notFound, onError, requestLogger } from '../middleware';
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

export default function createApp(services: APIServices) {
	const app = createRouter();

	app.use(requestId());
	app.use(requestLogger);
	app.use('*', async (c, next) => {
		c.set('services', services);
		await next();
	});
	app.notFound(notFound);
	app.onError(onError);

	return app;
}
