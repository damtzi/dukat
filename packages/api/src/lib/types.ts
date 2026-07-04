import { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Logger } from 'pino';

export interface AppBindings {
	Variables: {
		logger: Logger;
	};
}

export type AppOpenApi = OpenAPIHono<AppBindings>;

export type AppRouterHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>;
