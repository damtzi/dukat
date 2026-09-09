import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './budgets.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({
	userId: c.var.userId,
	workspaceId: c.req.valid('param').workspaceId
});

export const budgetsRouter = router
	.openapi(routes.report, async (c) => {
		const query = c.req.valid('query');
		return c.json(
			await c.var.services.budgets!.report(
				context(c),
				query.month,
				query.includeTentative === 'true'
			),
			200
		);
	})
	.openapi(routes.createBudget, async (c) =>
		c.json(await c.var.services.budgets!.create(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.updateBudget, async (c) =>
		c.json(
			await c.var.services.budgets!.update(
				context(c),
				c.req.valid('param').budgetId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.removeBudget, async (c) =>
		c.json(
			await c.var.services.budgets!.remove(
				context(c),
				c.req.valid('param').budgetId,
				c.req.valid('json')
			),
			200
		)
	);
