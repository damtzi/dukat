import { z } from 'zod';
import { legacyCurrencySchema, supportedCurrencySchema } from './exchange-rates';

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
export const currencySchema = supportedCurrencySchema;

export const INT64_MIN = -(1n << 63n);
export const INT64_MAX = (1n << 63n) - 1n;
export const BALANCE_DIFFERENCE_MAX = (1n << 64n) - 1n;
const canonicalIntegerPattern = /^-?(0|[1-9]\d*)$/;
const canonicalIntegerSchema = z
	.string()
	.regex(canonicalIntegerPattern, 'Amount must be a canonical decimal integer string');
export const minorUnitsSchema = canonicalIntegerSchema.refine((value) => {
	if (!canonicalIntegerPattern.test(value)) return false;
	const amount = BigInt(value);
	return amount >= INT64_MIN && amount <= INT64_MAX;
}, 'Amount is outside the signed 64-bit integer range');
export const balanceDifferenceSchema = canonicalIntegerSchema.refine((value) => {
	if (!canonicalIntegerPattern.test(value)) return false;
	const amount = BigInt(value);
	return amount >= -BALANCE_DIFFERENCE_MAX && amount <= BALANCE_DIFFERENCE_MAX;
}, 'Amount is outside the balance difference range');
export const balanceCorrectionAmountSchema = balanceDifferenceSchema.refine(
	(value) => canonicalIntegerPattern.test(value) && BigInt(value) !== 0n,
	'Correction must be non-zero'
);
export const positiveMinorUnitsSchema = minorUnitsSchema.refine(
	(value) => canonicalIntegerPattern.test(value) && BigInt(value) > 0n,
	'Amount must be positive'
);

export const isoCalendarDateSchema = z.string().superRefine((value, context) => {
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
});
export const calendarDateSchema = isoCalendarDateSchema.superRefine((value, context) => {
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
	currency: legacyCurrencySchema,
	openingBalanceMinor: minorUnitsSchema
});
export const versionedMutationSchema = mutationSchema.extend({
	version: z.number().int().positive()
});
export const archiveAccountSchema = versionedMutationSchema
	.extend({
		impactToken: z.string().min(1)
	})
	.strict();
export const createTransactionSchema = mutationSchema.extend({
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	date: calendarDateSchema,
	description: z.string().trim().max(500).nullable().optional(),
	categoryId: z.string().min(1).nullable().optional()
});
export const updateTransactionSchema = createTransactionSchema.extend({
	version: z.number().int().positive()
});
export const createTransferSchema = mutationSchema.extend({
	fromAccountId: z.string().min(1),
	toAccountId: z.string().min(1),
	amountMinor: positiveMinorUnitsSchema,
	receivedAmountMinor: positiveMinorUnitsSchema.optional(),
	date: calendarDateSchema,
	description: z.string().trim().max(500).nullable().optional()
});
export const updateTransferSchema = createTransferSchema.omit({ fromAccountId: true }).extend({
	version: z.number().int().positive()
});
export const createBalanceCheckSchema = mutationSchema.extend({
	accountId: z.string().min(1),
	date: calendarDateSchema,
	observedBalanceMinor: minorUnitsSchema
});
export const updateBalanceCheckSchema = createBalanceCheckSchema.omit({ accountId: true }).extend({
	version: z.number().int().positive()
});
export const createBalanceCorrectionSchema = mutationSchema.extend({
	accountId: z.string().min(1),
	date: calendarDateSchema,
	amountMinor: balanceCorrectionAmountSchema,
	description: z.string().trim().max(500).nullable().optional()
});

// HTTP ledger contracts. Dates and timestamps intentionally remain serialized strings.
const nullableTimestampSchema = z.string().nullable();
export const accountSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	name: z.string(),
	type: accountTypeSchema,
	currency: z.string(),
	openingBalanceMinor: minorUnitsSchema,
	version: z.number().int(),
	activityStartedAt: nullableTimestampSchema,
	archivedAt: nullableTimestampSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
	balanceMinor: minorUnitsSchema,
	negativeBalance: z.boolean(),
	canDelete: z.boolean(),
	canArchive: z.boolean(),
	canRestore: z.boolean()
});
export const accountArchiveImpactPlanSchema = z.object({
	id: z.string(),
	version: z.number().int().positive(),
	action: z.enum(['stop', 'cancel']),
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	date: isoCalendarDateSchema,
	status: z.enum(['expected', 'tentative']),
	description: z.string().nullable(),
	categoryId: z.string().nullable()
});
export const accountArchiveImpactSchema = z.object({
	accountVersion: z.number().int().positive(),
	date: isoCalendarDateSchema,
	plans: z.array(accountArchiveImpactPlanSchema),
	impactToken: z.string().min(1)
});
export const transactionSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	accountId: z.string(),
	kind: transactionKindSchema,
	amountMinor: positiveMinorUnitsSchema,
	date: z.string(),
	description: z.string().nullable(),
	categoryId: z.string().nullable(),
	source: z.literal('manual'),
	version: z.number().int(),
	trashedAt: nullableTimestampSchema,
	createdAt: z.string(),
	updatedAt: z.string()
});
export const transferSchema = z.object({
	id: z.string(),
	localSide: z.enum(['from', 'to']),
	accountId: z.string(),
	amountMinor: positiveMinorUnitsSchema,
	sentAmountMinor: positiveMinorUnitsSchema.nullable(),
	receivedAmountMinor: positiveMinorUnitsSchema.nullable(),
	date: z.string(),
	description: z.string().nullable(),
	version: z.number(),
	trashedAt: nullableTimestampSchema,
	detachedAt: nullableTimestampSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
	canManage: z.boolean(),
	counterparty: z.discriminatedUnion('visibility', [
		z.object({
			visibility: z.literal('full'),
			workspaceId: z.string(),
			accountId: z.string(),
			name: z.string()
		}),
		z.object({ visibility: z.literal('private') }),
		z.object({ visibility: z.literal('deleted') })
	])
});
export const balanceCheckSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	accountId: z.string(),
	date: z.string(),
	observedBalanceMinor: minorUnitsSchema,
	calculatedBalanceMinor: minorUnitsSchema.optional(),
	differenceMinor: balanceDifferenceSchema.optional(),
	version: z.number(),
	trashedAt: nullableTimestampSchema,
	createdAt: z.string(),
	updatedAt: z.string()
});
export const correctionSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	accountId: z.string(),
	date: z.string(),
	amountMinor: balanceCorrectionAmountSchema,
	description: z.string().nullable(),
	version: z.number(),
	trashedAt: nullableTimestampSchema,
	createdAt: z.string(),
	updatedAt: z.string()
});
export const historyEntrySchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	actorUserId: z.string(),
	entityType: z.enum([
		'transaction',
		'account',
		'transfer',
		'balance_check',
		'correction',
		'plan',
		'plan_occurrence',
		'plan_match'
	]),
	entityId: z.string(),
	action: z.string(),
	beforeJson: z.string().nullable(),
	afterJson: z.string().nullable(),
	createdAt: z.string()
});

export type CreateAccount = z.infer<typeof createAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type VersionedMutation = z.infer<typeof versionedMutationSchema>;
export type ArchiveAccount = z.infer<typeof archiveAccountSchema>;
export type AccountArchiveImpact = z.infer<typeof accountArchiveImpactSchema>;
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
export type CreateTransfer = z.infer<typeof createTransferSchema>;
export type UpdateTransfer = z.infer<typeof updateTransferSchema>;
export type CreateBalanceCheck = z.infer<typeof createBalanceCheckSchema>;
export type UpdateBalanceCheck = z.infer<typeof updateBalanceCheckSchema>;
export type CreateBalanceCorrection = z.infer<typeof createBalanceCorrectionSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type BalanceCheck = z.infer<typeof balanceCheckSchema>;
export type Correction = z.infer<typeof correctionSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
