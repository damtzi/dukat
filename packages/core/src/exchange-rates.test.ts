import assert from 'node:assert/strict';
import test from 'node:test';
import {
	addRational,
	convertMinor,
	convertMinorRational,
	decimalRational,
	isPolishBusinessDay,
	manualRateInputSchema,
	polishBusinessDaysAfter
} from './exchange-rates';
import { createAccountSchema, updateAccountSchema } from './ledger';

test('parses exact decimals without floating point', () => {
	assert.deepEqual(decimalRational('4.123456789'), {
		numerator: 4123456789n,
		denominator: 1000000000n
	});
});

test('foreign cross-rates through PLN round only the final amount', () => {
	assert.equal(convertMinor(12345n, 'EUR', 'USD', '4.123456789', '3.987654321'), 12765n);
	assert.equal(convertMinor(5n, 'KWD', 'JPY', '13.1', '0.026'), 3n);
	for (let amount = 1n; amount <= 10_000n; amount += 97n)
		assert.equal(convertMinor(amount, 'EUR', 'EUR', '4.2', '4.2'), amount);
});

test('aggregate conversion rounds once after exact values are added', () => {
	const half = convertMinorRational(1n, 'EUR', 'PLN', '0.5', '1');
	assert.deepEqual(addRational(half, half), { numerator: 1n, denominator: 1n });
});

test('manual rates require real calendar dates', () => {
	assert.equal(
		manualRateInputSchema.safeParse({
			currency: 'EUR',
			rateToPln: '4.2',
			effectiveDate: '2026-99-99',
			reason: 'Invalid date test'
		}).success,
		false
	);
});

test('rates reject excessive precision and magnitude', () => {
	for (const rateToPln of ['1234567890123', `1.${'1'.repeat(13)}`, '1'.repeat(10_000)])
		assert.equal(
			manualRateInputSchema.safeParse({
				currency: 'EUR',
				rateToPln,
				effectiveDate: '2026-08-01',
				reason: 'Bounded rate test'
			}).success,
			false
		);
});

test('legacy currencies are grandfathered only for account updates', () => {
	const account = {
		idempotencyKey: 'legacy-currency',
		name: 'Legacy account',
		type: 'cash' as const,
		currency: 'BGN',
		openingDate: '2026-01-01',
		openingBalanceMinor: '0'
	};
	assert.equal(createAccountSchema.safeParse(account).success, false);
	assert.equal(updateAccountSchema.safeParse({ ...account, version: 1 }).success, true);
});

test('staleness uses Polish weekends and public holidays', () => {
	assert.equal(isPolishBusinessDay(new Date('2026-04-06T12:00:00Z')), false);
	assert.equal(isPolishBusinessDay(new Date('2026-06-04T12:00:00Z')), false);
	assert.equal(isPolishBusinessDay(new Date('2026-06-05T12:00:00Z')), true);
	assert.equal(polishBusinessDaysAfter('2026-04-02', new Date('2026-04-10T12:00:00Z')), 5);
});
