import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as handlers from './favorites.handlers';
import * as routes from './favorites.routes';

const router = createRouter();
router.use('/favorites/*', authenticated);

export const favoritesRouter = router
	.openapi(routes.list, handlers.list)
	.openapi(routes.create, handlers.create)
	.openapi(routes.remove, handlers.remove);
