import { createRouter } from '../../lib/create-app';
import * as handlers from './health.handlers';
import * as routes from './health.routes';

export const healthRouter = createRouter()
	.openapi(routes.live, handlers.live)
	.openapi(routes.ready, handlers.ready);
