import { z } from 'zod';

import {
	isoCalendarDateSchema,
	mutationSchema,
	positiveMinorUnitsSchema,
	transactionKindSchema,
	versionedMutationSchema
} from './ledger';

const idSchema = z.string().min(1);
export const plannedStatusSchema = z.enum(['expected', 'tentative']);
export const recurrenceFrequencySchema = z.enum(['weekly', 'monthly', 'yearly']);
export const recurrenceRuleSchema = z
	.object({
		frequency: recurrenceFrequencySchema,
		interval: z.number().int().positive(),
		endDate: isoCalendarDateSchema.optional()
	})
	.strict()
	.refine((value) => !value.endDate || value.endDate.length === 10);
export const occurrenceExceptionSchema = z.discriminatedUnion('action', [
	z.object({ originalDate: isoCalendarDateSchema, action: z.literal('skip') }),
	z.object({ originalDate: isoCalendarDateSchema, action: z.literal('restore') }),
	z
		.object({
			originalDate: isoCalendarDateSchema,
			action: z.literal('change'),
			date: isoCalendarDateSchema.optional(),
			amountMinor: z.bigint().positive().optional(),
			status: plannedStatusSchema.optional()
		})
		.refine(
			(value) =>
				value.date !== undefined || value.amountMinor !== undefined || value.status !== undefined,
			{
				message: 'A changed occurrence must change at least one value'
			}
		)
]);

/** A later rule may start where an earlier rule ends to represent “this and future”. */
export const plannedTransactionSchema = z
	.object({
		id: idSchema,
		accountId: idSchema,
		kind: transactionKindSchema,
		amountMinor: z.bigint().positive(),
		date: isoCalendarDateSchema,
		effectiveFrom: isoCalendarDateSchema.optional(),
		status: plannedStatusSchema,
		recurrence: recurrenceRuleSchema.optional(),
		exceptions: z.array(occurrenceExceptionSchema).default([]),
		cutoffDate: isoCalendarDateSchema.nullable().optional(),
		active: z.boolean().default(true),
		cancelled: z.boolean().default(false)
	})
	.refine((value) => !value.recurrence?.endDate || value.recurrence.endDate >= value.date, {
		message: 'Recurrence end date must not precede its start date',
		path: ['recurrence', 'endDate']
	});

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export type OccurrenceException = z.infer<typeof occurrenceExceptionSchema>;
export type PlannedTransaction = z.infer<typeof plannedTransactionSchema>;

export const createPlanSchema = mutationSchema
	.extend({
		accountId: idSchema,
		kind: transactionKindSchema,
		amountMinor: positiveMinorUnitsSchema,
		date: isoCalendarDateSchema,
		status: plannedStatusSchema,
		description: z.string().trim().max(500).nullable().optional(),
		categoryId: idSchema.nullable().optional(),
		recurrence: recurrenceRuleSchema.optional()
	})
	.strict()
	.refine((value) => !value.recurrence?.endDate || value.recurrence.endDate >= value.date, {
		message: 'Recurrence end date must not precede its start date',
		path: ['recurrence', 'endDate']
	});
export const updatePlanSchema = versionedMutationSchema
	.extend({
		effectiveFrom: isoCalendarDateSchema.optional(),
		amountMinor: positiveMinorUnitsSchema.optional(),
		date: isoCalendarDateSchema.optional(),
		status: plannedStatusSchema.optional(),
		description: z.string().trim().max(500).nullable().optional(),
		categoryId: idSchema.nullable().optional()
	})
	.strict()
	.refine(
		(value) =>
			['amountMinor', 'date', 'status', 'description', 'categoryId'].some((key) => key in value),
		{
			message: 'At least one explicit plan field is required'
		}
	);
export const occurrenceMutationSchema = versionedMutationSchema
	.extend({
		date: isoCalendarDateSchema.optional(),
		amountMinor: positiveMinorUnitsSchema.optional(),
		status: plannedStatusSchema.optional()
	})
	.strict();
export const occurrenceRescheduleSchema = occurrenceMutationSchema.refine(
	(value) =>
		value.date !== undefined || value.amountMinor !== undefined || value.status !== undefined,
	{ message: 'A rescheduled occurrence must change at least one value' }
);
export const occurrenceVersionedMutationSchema = versionedMutationSchema.strict();
export const stopPlanSchema = versionedMutationSchema
	.extend({ stopDate: isoCalendarDateSchema })
	.strict();
export const matchMutationSchema = versionedMutationSchema
	.extend({ transactionId: idSchema })
	.strict();
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export interface PlannedOccurrence {
	planId: string;
	accountId: string;
	kind: 'income' | 'expense';
	amountMinor: bigint;
	status: 'expected' | 'tentative';
	originalDate: string;
	date: string;
}

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const format = (year: number, month: number, day: number) =>
	`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const daysInMonth = (year: number, month: number) =>
	new Date(Date.UTC(year, month, 0)).getUTCDate();
const addDays = (date: string, count: number) => {
	const [year, month, day] = parts(date);
	const result = new Date(Date.UTC(year, month - 1, day + count));
	return format(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
};

/** Adds recurrence steps from the anchor, so a month-end fallback never changes the chosen day. */
function recurrenceDate(anchor: string, frequency: RecurrenceRule['frequency'], steps: number) {
	const [year, month, day] = parts(anchor);
	if (frequency === 'weekly') return addDays(anchor, steps * 7);
	if (frequency === 'monthly') {
		const index = year * 12 + month - 1 + steps;
		const targetYear = Math.floor(index / 12);
		const targetMonth = (index % 12) + 1;
		return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
	}
	const targetYear = year + steps;
	return format(targetYear, month, Math.min(day, daysInMonth(targetYear, month)));
}

/** Checks immutable rule-generated identity, regardless of lifecycle state, cutoff, or exceptions. */
export function isRuleGeneratedOccurrence(
	planInput: PlannedTransaction,
	originalDate: string
): boolean {
	isoCalendarDateSchema.parse(originalDate);
	const plan = plannedTransactionSchema.parse(planInput);
	let generated = false;
	for (let index = 0; index < 100_000; index++) {
		const date = plan.recurrence
			? recurrenceDate(plan.date, plan.recurrence.frequency, index * plan.recurrence.interval)
			: plan.date;
		if (date === originalDate) {
			generated = true;
			break;
		}
		if (
			date > originalDate ||
			!plan.recurrence ||
			(plan.recurrence.endDate && date >= plan.recurrence.endDate)
		)
			break;
	}
	return generated && (!plan.recurrence?.endDate || originalDate <= plan.recurrence.endDate);
}

/** Resolves an active occurrence by its immutable rule-generated identity. */
export function resolveOccurrence(
	planInput: PlannedTransaction,
	originalDate: string
): PlannedOccurrence | undefined {
	const plan = plannedTransactionSchema.parse(planInput);
	if (
		plan.cancelled ||
		!plan.active ||
		(plan.cutoffDate && originalDate >= plan.cutoffDate) ||
		(plan.effectiveFrom && originalDate < plan.effectiveFrom) ||
		!isRuleGeneratedOccurrence(plan, originalDate)
	)
		return undefined;
	const exception = plan.exceptions.find((item) => item.originalDate === originalDate);
	if (exception?.action === 'skip') return undefined;
	const changed = exception?.action === 'change' ? exception : undefined;
	return {
		planId: plan.id,
		accountId: plan.accountId,
		kind: plan.kind,
		amountMinor: changed?.amountMinor ?? plan.amountMinor,
		status: changed?.status ?? plan.status,
		originalDate,
		date: changed?.date ?? originalDate
	};
}

/** Deterministically expands active occurrences in the inclusive calendar-date range. */
export function expandOccurrences(
	planInput: PlannedTransaction,
	from: string,
	to: string
): PlannedOccurrence[] {
	isoCalendarDateSchema.parse(from);
	isoCalendarDateSchema.parse(to);
	if (from > to) throw new Error('Expansion start date must not be after end date');
	const plan = plannedTransactionSchema.parse(planInput);
	if (!plan.active || plan.cancelled) return [];
	for (const exception of plan.exceptions)
		if (!isRuleGeneratedOccurrence(plan, exception.originalDate))
			throw new Error(
				`Exception date ${exception.originalDate} is not generated by the recurrence rule`
			);
	const exceptions = new Map(
		plan.exceptions.map((exception) => [exception.originalDate, exception])
	);
	const latestException = plan.exceptions.reduce(
		(latest, item) => (item.originalDate > latest ? item.originalDate : latest),
		to
	);
	const generationEnd = plan.recurrence
		? plan.recurrence.endDate && plan.recurrence.endDate < latestException
			? plan.recurrence.endDate
			: latestException
		: plan.date;
	const result: PlannedOccurrence[] = [];
	for (let index = 0; index < 100_000; index++) {
		const originalDate = plan.recurrence
			? recurrenceDate(plan.date, plan.recurrence.frequency, index * plan.recurrence.interval)
			: plan.date;
		if (originalDate > generationEnd) break;
		if (plan.cutoffDate && originalDate >= plan.cutoffDate) break;
		if (plan.effectiveFrom && originalDate < plan.effectiveFrom) continue;
		const exception = exceptions.get(originalDate);
		if (exception?.action !== 'skip') {
			const changed = exception?.action === 'change' ? exception : undefined;
			const occurrence: PlannedOccurrence = {
				planId: plan.id,
				accountId: plan.accountId,
				kind: plan.kind,
				amountMinor: changed?.amountMinor ?? plan.amountMinor,
				status: changed?.status ?? plan.status,
				originalDate,
				date: changed?.date ?? originalDate
			};
			if (occurrence.date >= from && occurrence.date <= to) result.push(occurrence);
		}
		if (!plan.recurrence) break;
		if (index === 99_999) throw new Error('Occurrence expansion limit exceeded');
	}
	return result.sort(
		(left, right) => left.date.localeCompare(right.date) || left.planId.localeCompare(right.planId)
	);
}

export interface ForecastAccount {
	id: string;
	currentBalanceMinor: bigint;
}
export interface ForecastOptions {
	today: string;
	includeTentative?: boolean;
	matchedOccurrences?: ReadonlySet<string>;
}
export interface ForecastResult extends ForecastAccount {
	startingBalanceMinor: bigint;
	endingBalanceMinor: bigint;
	occurrences: PlannedOccurrence[];
	points: Array<PlannedOccurrence & { projectedBalanceMinor: bigint }>;
}

const occurrenceKey = (item: PlannedOccurrence) => `${item.planId}:${item.originalDate}`;

/** Forecasts through the same date next year (inclusive), clamping 29 February to month-end. */
export function forecastBalances(
	accounts: readonly ForecastAccount[],
	plans: readonly PlannedTransaction[],
	options: ForecastOptions
): ForecastResult[] {
	isoCalendarDateSchema.parse(options.today);
	const end = recurrenceDate(options.today, 'yearly', 1);
	return accounts.map((account) => {
		const occurrences = plans
			.flatMap((plan) => {
				if (!plan.active || plan.cancelled) return [];
				const earliestDate = plan.exceptions.reduce(
					(earliest, exception) =>
						exception.action === 'change' && exception.date && exception.date < earliest
							? exception.date
							: earliest,
					plan.date
				);
				if (earliestDate > end) return [];
				return expandOccurrences(plan, earliestDate, end);
			})
			.filter((item) => item.accountId === account.id)
			.filter((item) => item.status === 'expected' || options.includeTentative)
			.filter((item) => !options.matchedOccurrences?.has(occurrenceKey(item)))
			.map((item) => (item.date < options.today ? { ...item, date: options.today } : item))
			.sort(
				(left, right) =>
					left.date.localeCompare(right.date) ||
					occurrenceKey(left).localeCompare(occurrenceKey(right))
			);
		let projectedBalanceMinor = account.currentBalanceMinor;
		const points = occurrences.map((item) => {
			projectedBalanceMinor += item.kind === 'income' ? item.amountMinor : -item.amountMinor;
			return { ...item, projectedBalanceMinor };
		});
		return {
			id: account.id,
			currentBalanceMinor: account.currentBalanceMinor,
			startingBalanceMinor: account.currentBalanceMinor,
			endingBalanceMinor: projectedBalanceMinor,
			occurrences,
			points
		};
	});
}

export interface MatchCandidate {
	id: string;
	accountId: string;
	kind: 'income' | 'expense';
	amountMinor: bigint;
	date: string;
}
export interface SuggestedMatch {
	transaction: MatchCandidate;
	equalAmount: boolean;
	dateDistanceDays: number;
	autoConfirmed: false;
}

const dateDistance = (left: string, right: string) =>
	Math.abs(new Date(`${left}T00:00:00Z`).getTime() - new Date(`${right}T00:00:00Z`).getTime()) /
	86_400_000;

/** Returns eligible suggestions only; callers must always ask a user to confirm. */
export function rankSuggestedMatches(
	occurrence: Pick<PlannedOccurrence, 'accountId' | 'kind' | 'amountMinor' | 'date'>,
	transactions: readonly MatchCandidate[]
): SuggestedMatch[] {
	return transactions
		.map((transaction) => ({
			transaction,
			equalAmount: transaction.amountMinor === occurrence.amountMinor,
			dateDistanceDays: dateDistance(transaction.date, occurrence.date),
			autoConfirmed: false as const
		}))
		.filter(
			(item) =>
				item.transaction.accountId === occurrence.accountId &&
				item.transaction.kind === occurrence.kind &&
				item.dateDistanceDays <= 14
		)
		.sort(
			(left, right) =>
				Number(right.equalAmount) - Number(left.equalAmount) ||
				left.dateDistanceDays - right.dateDistanceDays ||
				left.transaction.id.localeCompare(right.transaction.id)
		);
}
