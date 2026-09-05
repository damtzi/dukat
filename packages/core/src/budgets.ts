import { z } from 'zod';

import { mutationSchema, positiveMinorUnitsSchema, versionedMutationSchema } from './ledger';

export const budgetMonthSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM');
export const createBudgetSchema = mutationSchema
	.extend({
		categoryId: z.string().min(1),
		month: budgetMonthSchema,
		amountMinor: positiveMinorUnitsSchema
	})
	.strict();
export const updateBudgetSchema = versionedMutationSchema
	.extend({ amountMinor: positiveMinorUnitsSchema })
	.strict();
export const removeBudgetSchema = versionedMutationSchema.strict();
export const budgetSchema = z.object({
	id: z.string().min(1),
	workspaceId: z.string().min(1),
	categoryId: z.string().min(1),
	month: budgetMonthSchema,
	amountMinor: positiveMinorUnitsSchema,
	reportingCurrency: z.string().length(3),
	version: z.number().int().positive(),
	createdAt: z.string(),
	updatedAt: z.string()
});
export const budgetReportSchema = budgetSchema.extend({
	categoryName: z.string(),
	completedMinor: z.string(),
	expectedMinor: z.string(),
	remainingMinor: z.string(),
	forecastOverspendMinor: z.string(),
	missingRate: z.boolean()
});

export type Budget = z.infer<typeof budgetSchema>;
export type BudgetReport = z.infer<typeof budgetReportSchema>;
