import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './insights.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: any) => ({
	userId: c.var.userId,
	workspaceId: c.req.valid('param').workspaceId
});
const success = async (c: any, operation: () => Promise<unknown> | unknown) => {
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

export const insightsRouter = router
	.openapi(routes.listCategories, (c) =>
		success(c, () => c.var.services.insights.listCategories(context(c)))
	)
	.openapi(routes.createCategory, (c) =>
		success(c, () => c.var.services.insights.createCategory(context(c), c.req.valid('json')))
	)
	.openapi(routes.updateCategory, (c) =>
		success(c, () =>
			c.var.services.insights.updateCategory(
				context(c),
				c.req.valid('param').categoryId,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.categoryAction, (c) =>
		success(c, () =>
			c.var.services.insights.categoryAction(
				context(c),
				c.req.valid('param').categoryId,
				c.req.valid('param').action,
				c.req.valid('json')
			)
		)
	)
	.openapi(routes.summary, (c) =>
		success(c, async () => {
			const query = c.req.valid('query');
			const result = await c.var.services.insights.summary(context(c), {
				...query,
				accountIds: query.accountId
					? Array.isArray(query.accountId)
						? query.accountId
						: [query.accountId]
					: undefined
			});
			return c.var.services.exchangeRates
				? c.var.services.exchangeRates.reportingSummary(context(c).workspaceId, result)
				: result;
		})
	)
	.openapi(routes.preview, (c) =>
		success(c, () => c.var.services.insights.preview(context(c), c.req.valid('json')))
	)
	.openapi(routes.confirm, (c) =>
		success(c, () => c.var.services.insights.confirm(context(c), c.req.valid('json')))
	)
	.openapi(routes.listImports, (c) =>
		success(c, () => c.var.services.insights.listImports(context(c)))
	)
	.openapi(routes.importDetail, (c) =>
		success(c, () =>
			c.var.services.insights.importDetail(context(c), c.req.valid('param').importId)
		)
	)
	.openapi(routes.trashImport, (c) =>
		success(c, () =>
			c.var.services.insights.trashImport(
				context(c),
				c.req.valid('param').importId,
				c.req.valid('json').idempotencyKey
			)
		)
	);
