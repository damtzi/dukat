import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as r from './planning.routes';
const router = createRouter();
router.use('/workspaces/*', authenticated);
const service = (c: any) => c.var.services.planning;
const ctx = (c: any) => ({ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId });
const ok = async (c: any, fn: () => Promise<unknown>) => {
	try {
		return c.json(await fn(), 200);
	} catch (e) {
		const code = e && typeof e === 'object' && 'code' in e ? (e as any).code : undefined;
		if (code === 'not_found') return c.json({ message: (e as Error).message }, 404);
		if (code === 'conflict') return c.json({ message: (e as Error).message }, 409);
		if (code === 'invalid') return c.json({ message: (e as Error).message }, 400);
		throw e;
	}
};
export const planningRouter = router
	.openapi(r.list, (c) => ok(c, () => service(c).list(ctx(c))))
	.openapi(r.createPlan, (c) => ok(c, () => service(c).create(ctx(c), c.req.valid('json'))))
	.openapi(r.updatePlan, (c) =>
		ok(c, () => service(c).update(ctx(c), c.req.valid('param').planId, c.req.valid('json')))
	)
	.openapi(r.planHistory, (c) =>
		ok(c, () => service(c).history(ctx(c), c.req.valid('param').planId))
	)
	.openapi(r.planAction('cancel'), (c) =>
		ok(c, () =>
			service(c).planAction(ctx(c), c.req.valid('param').planId, 'cancel', c.req.valid('json'))
		)
	)
	.openapi(r.planAction('stop'), (c) =>
		ok(c, () =>
			service(c).planAction(ctx(c), c.req.valid('param').planId, 'stop', c.req.valid('json'))
		)
	)
	.openapi(r.occurrenceAction('skip'), (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'skip',
				c.req.valid('json')
			);
		})
	)
	.openapi(r.occurrenceAction('restore'), (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'restore',
				c.req.valid('json')
			);
		})
	)
	.openapi(r.occurrenceAction('reschedule'), (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).occurrenceAction(
				ctx(c),
				p.planId,
				p.originalDate,
				'reschedule',
				c.req.valid('json')
			);
		})
	)
	.openapi(r.suggestions, (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).suggestions(ctx(c), p.planId, p.originalDate);
		})
	)
	.openapi(r.match, (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).match(ctx(c), p.planId, p.originalDate, c.req.valid('json'));
		})
	)
	.openapi(r.unmatch, (c) =>
		ok(c, () => {
			const p = c.req.valid('param');
			return service(c).unmatch(ctx(c), p.planId, p.originalDate, c.req.valid('json'));
		})
	)
	.openapi(r.accountForecast, (c) =>
		ok(c, () => {
			const q = c.req.valid('query');
			if (q.accountId)
				return service(c).accountForecast(ctx(c), q.accountId, q.includeTentative === 'true');
			return (async () => {
				const context = ctx(c);
				const accounts = await c.var.services.ledger.listAccounts(context);
				if (!Array.isArray(accounts))
					throw new Error('Account service returned an invalid response');
				const forecasts = [];
				for (const account of accounts as Array<{ id: string }>)
					forecasts.push(
						await service(c).accountForecast(context, account.id, q.includeTentative === 'true')
					);
				if (!c.var.services.exchangeRates)
					return {
						estimate: true,
						reportingCurrency: null,
						missingRate: true,
						startingBalanceMinor: null,
						endingBalanceMinor: null,
						occurrences: [],
						points: [],
						accounts: forecasts
					};
				return c.var.services.exchangeRates.workspaceForecast(
					context.userId,
					context.workspaceId,
					forecasts
				);
			})();
		})
	);
