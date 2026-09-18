import { z } from 'zod';

import { accountTypeSchema, isoCalendarDateSchema } from './ledger';

const amountSchema = z.string().regex(/^-?(0|[1-9]\d*)$/);
const currencyAmountSchema = z.object({
	currency: z.string().length(3),
	amountMinor: amountSchema
});
const totalSchema = z.object({
	amountMinor: amountSchema.nullable(),
	missingRate: z.boolean()
});

const snapshotRateSchema = z.object({
	currency: z.string().length(3),
	rateToPln: z.string(),
	source: z.enum(['identity', 'NBP', 'manual']),
	effectiveDate: isoCalendarDateSchema,
	tableNumber: z.string().nullable(),
	manualOverrideId: z.string().nullable(),
	reason: z.string().nullable(),
	actorDisplay: z.string().nullable()
});

export const netWorthHistoryPointSchema = z.object({
	date: isoCalendarDateSchema,
	reportingCurrency: z.string().length(3),
	personalNetWorth: totalSchema,
	householdNetWorth: totalSchema,
	combinedNetWorth: totalSchema,
	workspaces: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			type: z.enum(['personal', 'household']),
			netWorthMinor: amountSchema.nullable(),
			missingRate: z.boolean(),
			accounts: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					type: accountTypeSchema,
					currency: z.string().length(3),
					balanceMinor: amountSchema,
					convertedBalanceMinor: amountSchema.nullable(),
					rates: z.array(snapshotRateSchema)
				})
			)
		})
	)
});

export const myOverviewSchema = z.object({
	reportingCurrency: z.string().length(3),
	personalNetWorth: totalSchema,
	householdNetWorth: totalSchema,
	combinedNetWorth: totalSchema,
	currentMonthSpending: totalSchema.extend({
		originals: z.array(currencyAmountSchema)
	}),
	spendingComparison: z.object({
		currentMonth: z.string().regex(/^\d{4}-\d{2}$/),
		typicalMonths: z.array(z.string().regex(/^\d{4}-\d{2}$/)).length(3),
		asOfDay: z.number().int().min(1).max(31),
		missingRate: z.boolean(),
		differenceMinor: amountSchema.nullable(),
		points: z.array(
			z.object({
				day: z.number().int().min(1).max(31),
				currentAmountMinor: amountSchema.nullable(),
				typicalAmountMinor: amountSchema
			})
		)
	}),
	recentTransactions: z
		.array(
			z.object({
				id: z.string(),
				workspaceId: z.string(),
				workspaceName: z.string(),
				workspaceType: z.enum(['personal', 'household']),
				accountId: z.string(),
				accountName: z.string(),
				kind: z.enum(['income', 'expense', 'refund']),
				amountMinor: amountSchema,
				currency: z.string().length(3),
				date: isoCalendarDateSchema,
				merchant: z.string().nullable(),
				description: z.string().nullable(),
				categoryName: z.string().nullable()
			})
		)
		.max(5),
	accounts: z.array(
		z.object({
			id: z.string(),
			workspaceId: z.string(),
			workspaceName: z.string(),
			workspaceType: z.enum(['personal', 'household']),
			name: z.string(),
			type: accountTypeSchema,
			currency: z.string().length(3),
			balanceMinor: amountSchema,
			convertedBalanceMinor: amountSchema.nullable(),
			archivedAt: z.string().nullable()
		})
	),
	upcoming: z.array(
		z.object({
			workspaceId: z.string(),
			workspaceName: z.string(),
			workspaceType: z.enum(['personal', 'household']),
			accountId: z.string(),
			accountName: z.string(),
			planId: z.string(),
			date: isoCalendarDateSchema,
			kind: z.enum(['income', 'expense']),
			currency: z.string().length(3),
			amountMinor: amountSchema,
			convertedAmountMinor: amountSchema.nullable()
		})
	),
	workspaces: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			type: z.enum(['personal', 'household']),
			netWorthMinor: amountSchema.nullable(),
			missingRate: z.boolean()
		})
	),
	history: z.array(netWorthHistoryPointSchema)
});

export type MyOverview = z.infer<typeof myOverviewSchema>;
export type NetWorthHistoryPoint = z.infer<typeof netWorthHistoryPointSchema>;
