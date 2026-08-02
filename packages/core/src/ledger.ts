import { z } from 'zod';

const isoCurrencies = new Set(
	(
		Intl as typeof Intl & {
			supportedValuesOf(key: 'currency'): string[];
		}
	).supportedValuesOf('currency')
);

export function todayInDefaultTimeZone(now = new Date()) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Warsaw',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(now);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? '';
	return `${value('year')}-${value('month')}-${value('day')}`;
}

export const accountTypeSchema = z.enum(['current', 'savings', 'cash']);
export const transactionKindSchema = z.enum(['income', 'expense']);
export const currencySchema = z
	.string()
	.regex(/^[A-Z]{3}$/, 'Currency must be an uppercase ISO 4217 code')
	.refine((currency) => isoCurrencies.has(currency), 'Currency must be a valid ISO 4217 code');

export const INT64_MIN = -(1n << 63n);
export const INT64_MAX = (1n << 63n) - 1n;
const canonicalIntegerPattern = /^-?(0|[1-9]\d*)$/;
const canonicalIntegerSchema = z
	.string()
	.regex(canonicalIntegerPattern, 'Amount must be a canonical decimal integer string');
export const minorUnitsSchema = canonicalIntegerSchema.refine((value) => {
	if (!canonicalIntegerPattern.test(value)) return false;
	const amount = BigInt(value);
	return amount >= INT64_MIN && amount <= INT64_MAX;
}, 'Amount is outside the signed 64-bit integer range');
export const positiveMinorUnitsSchema = minorUnitsSchema.refine(
	(value) => canonicalIntegerPattern.test(value) && BigInt(value) > 0n,
	'Amount must be positive'
);

export const calendarDateSchema = z.string().superRefine((value, context) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		context.addIssue({ code: 'custom', message: 'Date must use YYYY-MM-DD' });
		return;
	}
	const [year, month, day] = value.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		context.addIssue({ code: 'custom', message: 'Date must be a valid calendar date' });
		return;
	}
	if (value > todayInDefaultTimeZone()) {
		context.addIssue({ code: 'custom', message: 'Date cannot be in the future' });
	}
});

export const mutationSchema = z.object({ idempotencyKey: z.string().min(8).max(200) });
export const createAccountSchema = mutationSchema.extend({
	name: z.string().trim().min(1).max(120),
	type: accountTypeSchema,
	currency: currencySchema,
	openingBalanceMinor: minorUnitsSchema
});
export const updateAccountSchema = mutationSchema.extend({
	version: z.number().int().positive(),
	name: z.string().trim().min(1).max(120),
	type: accountTypeSchema,
	currency: currencySchema,
	openingBalanceMinor: minorUnitsSchema
});
export const versionedMutationSchema = mutationSchema.extend({
	version: z.number().int().positive()
});
export const createTransactionSchema = mutationSchema.extend({
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	date: calendarDateSchema,
	description: z.string().trim().max(500).nullable().optional()
});
export const updateTransactionSchema = createTransactionSchema.extend({
	version: z.number().int().positive()
});

export type CreateAccount = z.infer<typeof createAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type VersionedMutation = z.infer<typeof versionedMutationSchema>;
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
