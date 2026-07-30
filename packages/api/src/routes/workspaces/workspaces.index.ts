import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middlewares/authenticated';
import * as handlers from './workspaces.handlers';
import * as routes from './workspaces.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);

export const workspacesRouter = router
	.openapi(routes.list, handlers.list)
	.openapi(routes.getOne, handlers.getOne);
