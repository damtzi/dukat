import { z } from 'zod';

export const NBP_TABLE_A_CURRENCIES = [
	'AUD',
	'BRL',
	'CAD',
	'CHF',
	'CLP',
	'CNY',
	'CZK',
	'DKK',
	'EUR',
	'GBP',
	'HKD',
	'HUF',
	'IDR',
	'ILS',
	'INR',
	'ISK',
	'JPY',
	'KRW',
	'MXN',
	'MYR',
	'NOK',
	'NZD',
	'PHP',
	'RON',
	'SEK',
	'SGD',
	'THB',
	'TRY',
	'UAH',
	'USD',
	'XDR',
	'ZAR'
] as const;
const supportedCurrencies = new Set<string>(['PLN', ...NBP_TABLE_A_CURRENCIES]);
export const supportedCurrencySchema = z
	.string()
	.refine(
		(value) => supportedCurrencies.has(value),
		'Currency must be PLN or an NBP Table A currency'
	);

export const legacyCurrencySchema = z
	.string()
	.regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code');

export const exactDecimalSchema = z
	.string()
	.max(25, 'Rate is too long')
	.regex(
		/^(?:0|[1-9]\d{0,11})(?:\.\d{1,12})?$/,
		'Rate must be a positive canonical decimal with at most 12 integer and 12 decimal digits'
	)
	.refine((value) => BigInt(value.replace('.', '')) > 0n, 'Rate must be positive');

export interface Rational {
	numerator: bigint;
	denominator: bigint;
}

const gcd = (left: bigint, right: bigint): bigint =>
	right === 0n ? left : gcd(right, left % right);

export function addRational(left: Rational, right: Rational): Rational {
	const numerator = left.numerator * right.denominator + right.numerator * left.denominator;
	const denominator = left.denominator * right.denominator;
	const divisor = gcd(numerator < 0n ? -numerator : numerator, denominator);
	return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function roundRational(value: Rational) {
	const sign = value.numerator < 0n ? -1n : 1n;
	const absolute = value.numerator < 0n ? -value.numerator : value.numerator;
	return sign * ((absolute * 2n + value.denominator) / (value.denominator * 2n));
}

export function decimalRational(value: string): Rational {
	const parsed = exactDecimalSchema.parse(value);
	const [whole, fraction = ''] = parsed.split('.');
	return { numerator: BigInt(whole! + fraction), denominator: 10n ** BigInt(fraction.length) };
}

const currencyDigits = (currency: string) =>
	new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
		.maximumFractionDigits ?? 2;

/** Converts minor units through PLN and rounds half away from zero only once, at the end. */
export function convertMinorRational(
	amountMinor: bigint,
	fromCurrency: string,
	toCurrency: string,
	fromPlnRate: string,
	toPlnRate: string
): Rational {
	if (fromCurrency === toCurrency) return { numerator: amountMinor, denominator: 1n };
	const from = decimalRational(fromCurrency === 'PLN' ? '1' : fromPlnRate);
	const to = decimalRational(toCurrency === 'PLN' ? '1' : toPlnRate);
	const digitDifference = currencyDigits(toCurrency) - currencyDigits(fromCurrency);
	const scale = 10n ** BigInt(Math.abs(digitDifference));
	let numerator = amountMinor * from.numerator * to.denominator;
	let denominator = from.denominator * to.numerator;
	if (digitDifference >= 0) numerator *= scale;
	else denominator *= scale;
	const divisor = gcd(numerator < 0n ? -numerator : numerator, denominator);
	return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function convertMinor(
	amountMinor: bigint,
	fromCurrency: string,
	toCurrency: string,
	fromPlnRate: string,
	toPlnRate: string
) {
	return roundRational(
		convertMinorRational(amountMinor, fromCurrency, toCurrency, fromPlnRate, toPlnRate)
	);
}

const dateAtUtcNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export function todayInWarsaw(now = new Date()) {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Warsaw',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}
const easterSunday = (year: number) => {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(Date.UTC(year, month - 1, day, 12));
};

/** Polish business days used for NBP publication staleness. */
export function isPolishBusinessDay(date: Date) {
	if ([0, 6].includes(date.getUTCDay())) return false;
	const year = date.getUTCFullYear();
	const fixed = new Set([
		`${year}-01-01`,
		`${year}-01-06`,
		`${year}-05-01`,
		`${year}-05-03`,
		`${year}-08-15`,
		`${year}-11-01`,
		`${year}-11-11`,
		`${year}-12-24`,
		`${year}-12-25`,
		`${year}-12-26`
	]);
	const easter = easterSunday(year);
	const monday = new Date(easter);
	monday.setUTCDate(monday.getUTCDate() + 1);
	const corpusChristi = new Date(easter);
	corpusChristi.setUTCDate(corpusChristi.getUTCDate() + 60);
	return (
		!fixed.has(isoDate(date)) &&
		isoDate(date) !== isoDate(monday) &&
		isoDate(date) !== isoDate(corpusChristi)
	);
}

export function polishBusinessDaysAfter(effectiveDate: string, now = new Date()) {
	let count = 0;
	const cursor = dateAtUtcNoon(effectiveDate);
	const end = dateAtUtcNoon(todayInWarsaw(now));
	while (cursor < end) {
		cursor.setUTCDate(cursor.getUTCDate() + 1);
		if (isPolishBusinessDay(cursor)) count++;
	}
	return count;
}

export const manualRateInputSchema = z.object({
	currency: supportedCurrencySchema.refine((value) => value !== 'PLN'),
	rateToPln: exactDecimalSchema,
	effectiveDate: z.string().superRefine((value, context) => {
		const parsed = dateAtUtcNoon(value);
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
			Number.isNaN(parsed.getTime()) ||
			isoDate(parsed) !== value
		)
			context.addIssue({
				code: 'custom',
				message: 'Effective date must be a valid YYYY-MM-DD date'
			});
	}),
	reason: z.string().trim().min(3).max(500)
});

export type ManualRateInput = z.infer<typeof manualRateInputSchema>;
