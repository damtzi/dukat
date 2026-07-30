import { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { Logger } from 'pino';

import type { APIServices } from '../services';

export interface AppBindings {
	Variables: {
		logger: Logger;
		services: APIServices;
		userId: string;
	};
}

export type AppOpenAPI = OpenAPIHono<AppBindings>;

export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>;
