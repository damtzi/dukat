import { createRoute, z } from '@hono/zod-openapi';
import {
	createPlanSchema,
	matchMutationSchema,
	occurrenceRescheduleSchema,
	occurrenceVersionedMutationSchema,
	stopPlanSchema,
	updatePlanSchema
} from '@dukat/core/planning';
import {
	historyEntrySchema,
	isoCalendarDateSchema,
	minorUnitsSchema,
	positiveMinorUnitsSchema
} from '@dukat/core/ledger';
import { exchangeRateProvenanceSchema } from '@dukat/core/csv-import';
import { jsonContent } from '../../openapi/helpers';
const id = z.string().min(1);
const params = z.object({ workspaceId: id }),
	planParams = params.extend({ planId: id }),
	occurrenceParams = planParams.extend({ originalDate: isoCalendarDateSchema });

const planSchema = z.object({
	id,
	rootPlanId: id,
	workspaceId: id,
	accountId: id,
	kind: z.enum(['income', 'expense']),
	amountMinor: positiveMinorUnitsSchema,
	date: isoCalendarDateSchema,
	effectiveFrom: isoCalendarDateSchema,
	status: z.enum(['expected', 'tentative']),
	description: z.string().nullable(),
	categoryId: id.nullable(),
	recurrence: z
		.object({
			frequency: z.enum(['weekly', 'monthly', 'yearly']),
			interval: z.number().int().positive(),
			endDate: isoCalendarDateSchema.optional()
		})
		.optional(),
	cutoffDate: isoCalendarDateSchema.nullable(),
	cancelled: z.boolean(),
	version: z.number().int().positive(),
	createdAt: z.string(),
	updatedAt: z.string()
});
const occurrenceSchema = z.object({
	planId: id,
	accountId: id,
	kind: z.enum(['income', 'expense']),
	amountMinor: positiveMinorUnitsSchema,
	status: z.enum(['expected', 'tentative']),
	originalDate: isoCalendarDateSchema,
	date: isoCalendarDateSchema
});
const transactionSchema = z.object({
	id,
	date: isoCalendarDateSchema,
	amountMinor: positiveMinorUnitsSchema,
	description: z.string().nullable()
});
const suggestedTransactionSchema = transactionSchema.extend({
	accountId: id,
	kind: z.enum(['income', 'expense'])
});
const accountForecastSchema = z.object({
	id,
	currency: z.string(),
	currentBalanceMinor: minorUnitsSchema,
	startingBalanceMinor: minorUnitsSchema,
	endingBalanceMinor: minorUnitsSchema,
	occurrences: z.array(occurrenceSchema),
	points: z.array(occurrenceSchema.extend({ projectedBalanceMinor: minorUnitsSchema })),
	matchedOccurrences: z.array(
		z.object({ occurrence: occurrenceSchema, transaction: transactionSchema })
	)
});
const workspaceOccurrenceSchema = occurrenceSchema.extend({
	sourceCurrency: z.string().length(3),
	sourceAmountMinor: positiveMinorUnitsSchema
});
const workspaceForecastSchema = z.object({
	estimate: z.literal(true),
	reportingCurrency: z.string().nullable(),
	missingRate: z.boolean(),
	startingBalanceMinor: minorUnitsSchema.nullable(),
	endingBalanceMinor: minorUnitsSchema.nullable(),
	occurrences: z.array(workspaceOccurrenceSchema),
	points: z.array(workspaceOccurrenceSchema.extend({ projectedBalanceMinor: minorUnitsSchema })),
	accounts: z.array(accountForecastSchema),
	rates: z.array(exchangeRateProvenanceSchema).optional()
});
const responses = (schema: z.ZodType, description: string) => ({
	200: jsonContent(schema, description),
	400: jsonContent(z.object({ message: z.string() }), 'Invalid'),
	401: jsonContent(z.object({ message: z.string() }), 'Unauthorized'),
	404: jsonContent(z.object({ message: z.string() }), 'Not found'),
	409: jsonContent(z.object({ message: z.string() }), 'Conflict')
});
const common = { tags: ['Planning'], security: [{ sessionCookie: [] }] };
export const list = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/plans',
	request: { params },
	responses: responses(z.array(planSchema), 'Plans')
});
export const createPlan = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/plans',
	request: { params, body: jsonContent(createPlanSchema, 'Plan') },
	responses: responses(planSchema, 'Created plan')
});
export const updatePlan = createRoute({
	...common,
	method: 'put',
	path: '/workspaces/{workspaceId}/plans/{planId}',
	request: { params: planParams, body: jsonContent(updatePlanSchema, 'Plan') },
	responses: responses(planSchema, 'Updated plan')
});
export const planHistory = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/plans/{planId}/history',
	request: { params: planParams },
	responses: responses(z.array(historyEntrySchema), 'Plan history')
});
export const planAction = (action: 'cancel' | 'stop') =>
	createRoute({
		...common,
		method: 'post',
		path: `/workspaces/{workspaceId}/plans/{planId}/${action}` as const,
		request: {
			params: planParams,
			body: jsonContent(
				action === 'stop' ? stopPlanSchema : occurrenceVersionedMutationSchema,
				action
			)
		},
		responses: responses(planSchema, `${action} plan`)
	});
export const occurrenceAction = (action: 'skip' | 'restore' | 'reschedule') =>
	createRoute({
		...common,
		method: 'post',
		path: `/workspaces/{workspaceId}/plans/{planId}/occurrences/{originalDate}/${action}` as const,
		request: {
			params: occurrenceParams,
			body: jsonContent(
				action === 'reschedule' ? occurrenceRescheduleSchema : occurrenceVersionedMutationSchema,
				action
			)
		},
		responses: responses(
			z.object({ ok: z.literal(true), version: z.number().int().positive() }),
			`${action} occurrence`
		)
	});
export const suggestions = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/plans/{planId}/occurrences/{originalDate}/suggestions',
	request: { params: occurrenceParams },
	responses: responses(
		z.array(
			z.object({
				transaction: suggestedTransactionSchema,
				equalAmount: z.boolean(),
				dateDistanceDays: z.number(),
				autoConfirmed: z.literal(false)
			})
		),
		'Match suggestions'
	)
});
export const match = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/plans/{planId}/occurrences/{originalDate}/match',
	request: {
		params: occurrenceParams,
		body: jsonContent(matchMutationSchema, 'Match')
	},
	responses: responses(
		z.object({
			matched: z.literal(true),
			version: z.number().int().positive(),
			amountMismatch: z.boolean(),
			plannedAmountMinor: positiveMinorUnitsSchema,
			transactionAmountMinor: positiveMinorUnitsSchema
		}),
		'Matched occurrence'
	)
});
export const unmatch = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/plans/{planId}/occurrences/{originalDate}/unmatch',
	request: {
		params: occurrenceParams,
		body: jsonContent(occurrenceVersionedMutationSchema, 'Unmatch')
	},
	responses: responses(
		z.object({ unmatched: z.literal(true), version: z.number().int().positive() }),
		'Unmatched occurrence'
	)
});
export const accountForecast = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/forecast',
	request: {
		params,
		query: z.object({
			accountId: id.optional(),
			includeTentative: z.enum(['true', 'false']).optional()
		})
	},
	responses: responses(
		z.union([accountForecastSchema, workspaceForecastSchema]),
		'12-month forecast'
	)
});
