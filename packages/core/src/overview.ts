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

export const myOverviewSchema = z.object({
	reportingCurrency: z.string().length(3),
	personalNetWorth: totalSchema,
	householdNetWorth: totalSchema,
	combinedNetWorth: totalSchema,
	currentMonthSpending: totalSchema.extend({
		originals: z.array(currencyAmountSchema)
	}),
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
	)
});

export type MyOverview = z.infer<typeof myOverviewSchema>;
