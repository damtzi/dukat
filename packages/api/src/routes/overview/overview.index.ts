import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import { getOverview } from './overview.routes';

const router = createRouter();
router.use('/overview', authenticated);

export const overviewRouter = router.openapi(getOverview, async (c) => {
	if (!c.var.services.overview) throw new Error('Overview service is unavailable');
	return c.json(await c.var.services.overview.get(c.var.userId), 200);
});
