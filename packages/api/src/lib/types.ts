import { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { BaseLogger } from '@hono/structured-logger';

import type { APIServices } from '../services';

export interface AppBindings {
	Variables: {
		logger: BaseLogger;
		services: APIServices;
		userId: string;
	};
}

export type AppOpenAPI = OpenAPIHono<AppBindings>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>;
