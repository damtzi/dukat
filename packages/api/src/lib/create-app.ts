import { OpenAPIHono } from '@hono/zod-openapi';
import { notFound, onError, pinoLogger } from '../middlewares';
import { requestId } from 'hono/request-id';
import type { AppBindings } from './types';
import { defaultHook } from '../openapi';

export function createRouter() {
	return new OpenAPIHono<AppBindings>({
		strict: false,
		defaultHook: defaultHook
	});
}

export default function createApp() {
	const app = createRouter();

	app.use(requestId());
	app.use(pinoLogger);
	app.notFound(notFound);
	app.onError(onError);

	return app;
}
