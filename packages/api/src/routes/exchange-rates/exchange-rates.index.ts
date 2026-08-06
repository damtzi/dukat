import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import { bodyLimit } from 'hono/body-limit';
import * as routes from './exchange-rates.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
router.use('/rates/*', authenticated);
router.use(
	'/workspaces/:workspaceId/rates/manual',
	bodyLimit({
		maxSize: 16 * 1024,
		onError: (c) => c.json({ message: 'Request body is too large' }, 413)
	})
);
const rates = (c: any) => {
	if (!c.var.services.exchangeRates) throw new Error('Exchange-rate service is unavailable');
	return c.var.services.exchangeRates;
};
const ids = (c: any) => ({
	userId: c.var.userId as string,
	workspaceId: c.req.valid('param').workspaceId as string
});
const run = async (c: any, operation: () => Promise<unknown>) => {
	try {
		return c.json(await operation());
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		return c.json({ message: (error as Error).message }, code === 'not_found' ? 404 : 400);
	}
};

export const exchangeRatesRouter = router
	.openapi(routes.status, (c) => run(c, () => rates(c).status()))
	.openapi(routes.listManual, (c) =>
		run(c, () => rates(c).listOverrides(ids(c).userId, ids(c).workspaceId))
	)
	.openapi(routes.addManual, async (c) =>
		run(c, async () => rates(c).addOverride(ids(c).userId, ids(c).workspaceId, c.req.valid('json')))
	)
	.openapi(routes.removeManual, (c) =>
		run(c, () =>
			rates(c).removeOverride(ids(c).userId, ids(c).workspaceId, c.req.valid('param').id)
		)
	)
	.openapi(routes.quote, (c) =>
		run(c, () => rates(c).quote(ids(c).userId, ids(c).workspaceId, c.req.valid('json')))
	)
	.openapi(routes.convertedBalances, (c) =>
		run(c, () => rates(c).currentBalances(ids(c).userId, ids(c).workspaceId, c.var.services.ledger))
	);
