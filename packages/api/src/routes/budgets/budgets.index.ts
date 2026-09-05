import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './budgets.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: any) => ({
	userId: c.var.userId,
	workspaceId: c.req.valid('param').workspaceId
});
const success = async (c: any, operation: () => Promise<unknown>) => {
	try {
		return c.json(await operation(), 200);
	} catch (error) {
		const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
		if (code === 'not_found') return c.json({ message: (error as Error).message }, 404);
		if (code === 'conflict') return c.json({ message: (error as Error).message }, 409);
		if (code === 'invalid') return c.json({ message: (error as Error).message }, 400);
		throw error;
	}
};

export const budgetsRouter = router
	.openapi(routes.report, (c) => {
		const query = c.req.valid('query');
		return success(c, () =>
			c.var.services.budgets!.report(context(c), query.month, query.includeTentative === 'true')
		);
	})
	.openapi(routes.createBudget, (c) =>
		success(c, () => c.var.services.budgets!.create(context(c), c.req.valid('json')))
	)
	.openapi(routes.updateBudget, (c) =>
		success(c, () =>
			c.var.services.budgets!.update(context(c), c.req.valid('param').budgetId, c.req.valid('json'))
		)
	)
	.openapi(routes.removeBudget, (c) =>
		success(c, () =>
			c.var.services.budgets!.remove(context(c), c.req.valid('param').budgetId, c.req.valid('json'))
		)
	);
