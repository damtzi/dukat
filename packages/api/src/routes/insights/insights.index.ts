import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as routes from './insights.routes';

const router = createRouter();
router.use('/workspaces/*', authenticated);
const context = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({
	userId: c.var.userId,
	workspaceId: c.req.valid('param').workspaceId
});

export const insightsRouter = router
	.openapi(routes.listCategories, async (c) =>
		c.json(await c.var.services.insights.listCategories(context(c)), 200)
	)
	.openapi(routes.createCategory, async (c) =>
		c.json(await c.var.services.insights.createCategory(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.updateCategory, async (c) =>
		c.json(
			await c.var.services.insights.updateCategory(
				context(c),
				c.req.valid('param').categoryId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.categoryAction, async (c) =>
		c.json(
			await c.var.services.insights.categoryAction(
				context(c),
				c.req.valid('param').categoryId,
				c.req.valid('param').action,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(routes.summary, async (c) => {
		const query = c.req.valid('query');
		const result = await c.var.services.insights.summary(context(c), {
			...query,
			accountIds: query.accountId
				? Array.isArray(query.accountId)
					? query.accountId
					: [query.accountId]
				: undefined
		});
		return c.json(
			c.var.services.exchangeRates
				? await c.var.services.exchangeRates.reportingSummary(context(c).workspaceId, result)
				: result,
			200
		);
	})
	.openapi(routes.cashFlow, async (c) => {
		const query = c.req.valid('query');
		const result = await c.var.services.insights.summary(context(c), query);
		return c.json(
			await c.var.services.exchangeRates!.reportingCashFlow(
				context(c).workspaceId,
				result,
				query.startDate,
				query.endDate
			),
			200
		);
	})
	.openapi(routes.preview, async (c) =>
		c.json(await c.var.services.insights.preview(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.confirm, async (c) =>
		c.json(await c.var.services.insights.confirm(context(c), c.req.valid('json')), 200)
	)
	.openapi(routes.listImports, async (c) =>
		c.json(await c.var.services.insights.listImports(context(c)), 200)
	)
	.openapi(routes.importDetail, async (c) =>
		c.json(
			await c.var.services.insights.importDetail(context(c), c.req.valid('param').importId),
			200
		)
	)
	.openapi(routes.trashImport, async (c) =>
		c.json(
			await c.var.services.insights.trashImport(
				context(c),
				c.req.valid('param').importId,
				c.req.valid('json').idempotencyKey
			),
			200
		)
	);
