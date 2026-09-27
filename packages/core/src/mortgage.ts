import { z } from 'zod';
import { calendarDateSchema, positiveMinorUnitsSchema } from './ledger';

const mortgageFields = z
	.object({
		idempotencyKey: z.string().min(8).max(200),
		originalPrincipalMinor: positiveMinorUnitsSchema,
		currentBalanceMinor: positiveMinorUnitsSchema,
		startDate: calendarDateSchema,
		termMonths: z.number().int().min(1).max(600),
		interestType: z.enum(['fixed', 'variable']),
		annualRateBasisPoints: z.number().int().min(0).max(10000),
		paymentAccountId: z.string().min(1)
	})
	.strict();
export const createMortgageSchema = mortgageFields.refine(
	(value) => BigInt(value.currentBalanceMinor) <= BigInt(value.originalPrincipalMinor),
	{
		message: 'Current balance cannot exceed original principal',
		path: ['currentBalanceMinor']
	}
);

export const mortgageSchema = mortgageFields.omit({ idempotencyKey: true }).extend({
	id: z.string(),
	workspaceId: z.string(),
	currency: z.string(),
	paymentAccountName: z.string()
});

export type Mortgage = z.infer<typeof mortgageSchema>;
export type MortgagePayment = {
	number: number;
	date: string;
	openingBalanceMinor: string;
	principalMinor: string;
	interestMinor: string;
	paymentMinor: string;
	closingBalanceMinor: string;
};

export function mortgageDate(start: string, monthOffset: number): string {
	const [year, month, day] = start.split('-').map(Number) as [number, number, number];
	const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
	const lastDay = new Date(
		Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
	).getUTCDate();
	return `${first.getUTCFullYear().toString().padStart(4, '0')}-${(first.getUTCMonth() + 1).toString().padStart(2, '0')}-${Math.min(day, lastDay).toString().padStart(2, '0')}`;
}

const interest = (balance: bigint, basisPoints: number) =>
	(balance * BigInt(basisPoints) + 60000n) / 120000n;

/** The supplied balance is a snapshot as of today; past installments are not inferred. */
export function mortgageSchedule(
	mortgage: Pick<
		Mortgage,
		'startDate' | 'termMonths' | 'currentBalanceMinor' | 'annualRateBasisPoints'
	>,
	today: string
): MortgagePayment[] {
	const firstNumber = Array.from({ length: mortgage.termMonths }, (_, index) => index + 1).find(
		(number) => mortgageDate(mortgage.startDate, number) > today
	);
	if (!firstNumber) return [];
	const count = mortgage.termMonths - firstNumber + 1;
	const rate = mortgage.annualRateBasisPoints;
	const original = BigInt(mortgage.currentBalanceMinor);
	// Find the smallest whole-minor-unit installment which retires the debt on time.
	const retires = (payment: bigint) => {
		let balance = original;
		for (let i = 0; i < count && balance > 0n; i++) {
			balance += interest(balance, rate) - payment;
		}
		return balance <= 0n;
	};
	let low = 0n;
	let high = original + interest(original, rate);
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (retires(middle)) high = middle;
		else low = middle;
	}
	const schedule: MortgagePayment[] = [];
	let balance = original;
	for (let number = firstNumber; number <= mortgage.termMonths && balance > 0n; number++) {
		const opening = balance;
		const cost = interest(balance, rate);
		const principal = high - cost > balance ? balance : high - cost;
		balance -= principal;
		schedule.push({
			number,
			date: mortgageDate(mortgage.startDate, number),
			openingBalanceMinor: opening.toString(),
			principalMinor: principal.toString(),
			interestMinor: cost.toString(),
			paymentMinor: (principal + cost).toString(),
			closingBalanceMinor: balance.toString()
		});
	}
	return schedule;
}
