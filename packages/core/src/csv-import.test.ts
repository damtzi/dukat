import assert from 'node:assert/strict';
import test from 'node:test';

import { summaryInputSchema } from './csv-import';
import { calendarDateSchema } from './ledger';
import { decimalToMinor, parseCsv } from './csv-import';

test('CSV parser supports quoted commas, escaped quotes, CRLF and trailing blank lines', () => {
	assert.deepEqual(
		parseCsv(
			'date,kind,amount,description,category\r\n2026-01-02,expense,12.30,"Food, ""nice""",Eating out\r\n\r\n'
		),
		[
			['date', 'kind', 'amount', 'description', 'category'],
			['2026-01-02', 'expense', '12.30', 'Food, "nice"', 'Eating out']
		]
	);
});

test('CSV parser rejects malformed quotes', () => {
	assert.throws(() => parseCsv('a,"b"x'), /after closing quote/);
	assert.throws(() => parseCsv('a,b"c'), /Unexpected quote/);
	assert.throws(() => parseCsv('a,"b'), /Unclosed/);
});

test('decimal amounts convert using currency precision and enforce positive int64', () => {
	assert.equal(decimalToMinor('12.3', 'PLN'), '1230');
	assert.equal(decimalToMinor('12', 'JPY'), '12');
	assert.throws(() => decimalToMinor('1.001', 'PLN'), /decimal places/);
	assert.throws(() => decimalToMinor('0', 'PLN'), /positive int64/);
	assert.throws(() => decimalToMinor('92233720368547758.08', 'PLN'), /int64/);
});

test('summary accepts a future month-end while completed transactions remain nonfuture', () => {
	assert.equal(
		summaryInputSchema.safeParse({ startDate: '9999-12-01', endDate: '9999-12-31' }).success,
		true
	);
	assert.equal(calendarDateSchema.safeParse('9999-12-31').success, false);
});
