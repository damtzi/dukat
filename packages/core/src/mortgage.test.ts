import assert from 'node:assert/strict';
import test from 'node:test';
import { mortgageSchedule } from './mortgage';

test('month-end dates clamp independently and the final installment clears odd minor units', () => {
	const schedule = mortgageSchedule(
		{
			startDate: '2024-01-31',
			termMonths: 3,
			currentBalanceMinor: '100',
			annualRateBasisPoints: 0
		},
		'2024-01-31'
	);
	assert.deepEqual(
		schedule.map(({ date, principalMinor, interestMinor, closingBalanceMinor }) => [
			date,
			principalMinor,
			interestMinor,
			closingBalanceMinor
		]),
		[
			['2024-02-29', '34', '0', '66'],
			['2024-03-31', '34', '0', '32'],
			['2024-04-30', '32', '0', '0']
		]
	);
});

test('today is not a future due date; remaining term uses current balance and rounded interest', () => {
	const schedule = mortgageSchedule(
		{
			startDate: '2024-01-31',
			termMonths: 3,
			currentBalanceMinor: '101',
			annualRateBasisPoints: 1200
		},
		'2024-02-29'
	);
	assert.deepEqual(
		schedule.map(({ number, date, paymentMinor, principalMinor, interestMinor }) => [
			number,
			date,
			paymentMinor,
			principalMinor,
			interestMinor
		]),
		[
			[2, '2024-03-31', '52', '51', '1'],
			[3, '2024-04-30', '51', '50', '1']
		]
	);
});
