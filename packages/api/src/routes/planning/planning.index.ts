import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as r from './planning.routes';
const router = createRouter();
router.use('/workspaces/*', authenticated);
const ctx = (c: {
	var: { userId: string };
	req: { valid(target: 'param'): { workspaceId: string } };
}) => ({ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId });
export const planningRouter = router
	.openapi(r.list, async (c) => c.json(await c.var.services.planning.list(ctx(c)), 200))
	.openapi(r.createPlan, async (c) =>
		c.json(await c.var.services.planning.create(ctx(c), c.req.valid('json')), 200)
	)
	.openapi(r.updatePlan, async (c) =>
		c.json(
			await c.var.services.planning.update(
				ctx(c),
				c.req.valid('param').planId,
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(r.planHistory, async (c) =>
		c.json(await c.var.services.planning.history(ctx(c), c.req.valid('param').planId), 200)
	)
	.openapi(r.planAction('cancel'), async (c) =>
		c.json(
			await c.var.services.planning.planAction(
				ctx(c),
				c.req.valid('param').planId,
				'cancel',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(r.planAction('stop'), async (c) =>
		c.json(
			await c.var.services.planning.planAction(
				ctx(c),
				c.req.valid('param').planId,
				'stop',
				c.req.valid('json')
			),
			200
		)
	)
	.openapi(r.occurrenceAction('skip'), async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.planning.occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'skip',
				c.req.valid('json')
			),
			200
		);
	})
	.openapi(r.occurrenceAction('restore'), async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.planning.occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'restore',
				c.req.valid('json')
			),
			200
		);
	})
	.openapi(r.occurrenceAction('reschedule'), async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.planning.occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'reschedule',
				c.req.valid('json')
			),
			200
		);
	})
	.openapi(r.suggestions, async (c) => {
		const p = c.req.valid('param');
		return c.json(await c.var.services.planning.suggestions(ctx(c), p.planId, p.originalDate), 200);
	})
	.openapi(r.match, async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.planning.match(ctx(c), p.planId, p.originalDate, c.req.valid('json')),
			200
		);
	})
	.openapi(r.unmatch, async (c) => {
		const p = c.req.valid('param');
		return c.json(
			await c.var.services.planning.unmatch(ctx(c), p.planId, p.originalDate, c.req.valid('json')),
			200
		);
	})
	.openapi(r.accountForecast, async (c) => {
		const q = c.req.valid('query');
		if (q.accountId)
			return c.json(
				await c.var.services.planning.accountForecast(
					ctx(c),
					q.accountId,
					q.includeTentative === 'true'
				),
				200
			);
		const context = ctx(c);
		const accounts = await c.var.services.ledger.listAccounts(context);
		if (!Array.isArray(accounts)) throw new Error('Account service returned an invalid response');
		const forecasts = [];
		for (const account of accounts as Array<{ id: string }>)
			forecasts.push(
				await c.var.services.planning.accountForecast(
					context,
					account.id,
					q.includeTentative === 'true'
				)
			);
		if (!c.var.services.exchangeRates)
			return c.json(
				{
					estimate: true,
					reportingCurrency: null,
					missingRate: true,
					startingBalanceMinor: null,
					endingBalanceMinor: null,
					occurrences: [],
					points: [],
					accounts: forecasts
				},
				200
			);
		return c.json(
			await c.var.services.exchangeRates.workspaceForecast(
				context.userId,
				context.workspaceId,
				forecasts
			),
			200
		);
	});
