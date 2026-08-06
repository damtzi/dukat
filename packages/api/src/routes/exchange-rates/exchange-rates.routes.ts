import { createRoute, z } from '@hono/zod-openapi';
import { accountSchema, exchangeRateProvenanceSchema } from '@dukat/core';
import { calendarDateSchema, positiveMinorUnitsSchema } from '@dukat/core/ledger';
import { manualRateInputSchema, supportedCurrencySchema } from '@dukat/core/exchange-rates';
import { jsonContent } from '../../openapi/helpers';

const id = z.string().min(1);
const params = z.object({ workspaceId: id });
const message = z.object({ message: z.string() });
const manualRate = z.object({
	id,
	workspaceId: id,
	currency: z.string().length(3),
	rateToPln: z.string(),
	effectiveDate: z.string(),
	reason: z.string(),
	actorUserId: z.string().nullable(),
	actorDisplay: z.string(),
	removedByUserId: z.string().nullable().optional(),
	removedAt: z.union([z.string(), z.date()]).nullable().optional(),
	createdAt: z.union([z.string(), z.date()]).optional()
});
const errors = {
	400: jsonContent(message, 'Invalid request'),
	401: jsonContent(message, 'Authentication required'),
	404: jsonContent(message, 'Not found')
};
const common = () => ({ tags: ['Exchange rates'], security: [{ sessionCookie: [] }] });

export const status = createRoute({
	...common(),
	method: 'get',
	path: '/rates/status',
	responses: {
		200: jsonContent(
			z.object({
				available: z.boolean(),
				stale: z.boolean(),
				latest: z
					.object({ effectiveDate: z.string(), tableNumber: z.string(), source: z.string() })
					.passthrough()
					.nullable()
			}),
			'Cached NBP status'
		),
		...errors
	}
});
export const listManual = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/rates',
	request: { params },
	responses: { 200: jsonContent(z.array(manualRate), 'Manual rates'), ...errors }
});
export const addManual = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/rates/manual',
	request: { params, body: jsonContent(manualRateInputSchema, 'Manual rate') },
	responses: { 200: jsonContent(manualRate, 'Manual rate'), ...errors }
});
export const removeManual = createRoute({
	...common(),
	method: 'delete',
	path: '/workspaces/{workspaceId}/rates/manual/{id}',
	request: { params: params.extend({ id }) },
	responses: {
		200: jsonContent(z.object({ deleted: z.literal(true) }), 'Removed manual rate'),
		...errors
	}
});
export const convertedBalances = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/balances/converted',
	request: { params },
	responses: {
		200: jsonContent(
			z.object({
				reportingCurrency: z.string().length(3),
				totalMinor: z.string().nullable(),
				missingRate: z.boolean(),
				rates: z.array(exchangeRateProvenanceSchema),
				accounts: z.array(
					accountSchema.extend({
						convertedBalanceMinor: z.string().nullable(),
						rates: z.array(exchangeRateProvenanceSchema)
					})
				)
			}),
			'Balances in reporting currency'
		),
		...errors
	}
});
export const quote = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/rates/quote',
	request: {
		params,
		body: jsonContent(
			z.object({
				fromCurrency: supportedCurrencySchema,
				toCurrency: supportedCurrencySchema,
				date: calendarDateSchema,
				amountMinor: positiveMinorUnitsSchema
			}),
			'Transfer quote'
		)
	},
	responses: {
		200: jsonContent(
			z.object({
				available: z.boolean(),
				suggestedAmountMinor: z.string().nullable(),
				rates: z.array(exchangeRateProvenanceSchema)
			}),
			'Transfer quote'
		),
		...errors
	}
});
