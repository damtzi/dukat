import assert from 'node:assert/strict';
import test from 'node:test';

import { dailyScheduleDate, runTrackedJob } from './scheduled-jobs';

test('daily jobs wait until their UTC start hour', () => {
	assert.equal(dailyScheduleDate(new Date('2026-09-08T12:59:59Z'), 13), null);
	assert.equal(dailyScheduleDate(new Date('2026-09-08T13:00:00Z'), 13), '2026-09-08');
});

test('tracked jobs run once after success', async () => {
	let status: 'missing' | 'running' | 'succeeded' | 'failed' = 'missing';
	const records: unknown[][] = [];
	const jobs = {
		async claim() {
			if (status === 'running' || status === 'succeeded') return null;
			status = 'running';
			return 'claim-1';
		},
		async finish(...args: unknown[]) {
			records.push(args);
			status = args[1] as 'succeeded' | 'failed';
		}
	};
	let runs = 0;
	const task = async () => {
		runs += 1;
	};

	assert.equal(await runTrackedJob(jobs, 'maintenance', '2026-09-08T02', task, 'FAILED'), true);
	assert.equal(await runTrackedJob(jobs, 'maintenance', '2026-09-08T02', task, 'FAILED'), false);
	assert.equal(runs, 1);
	assert.deepEqual(records, [['claim-1', 'succeeded']]);
});

test('tracked job failure records only its safe code and can retry', async () => {
	let status: 'missing' | 'running' | 'failed' = 'missing';
	const records: unknown[][] = [];
	const jobs = {
		async claim() {
			if (status === 'running') return null;
			status = 'running';
			return 'claim-1';
		},
		async finish(...args: unknown[]) {
			records.push(args);
			status = args[1] as 'failed';
		}
	};
	const task = async () => {
		throw new Error('email@example.com 12345 secret');
	};

	await assert.rejects(() =>
		runTrackedJob(jobs, 'maintenance', '2026-09-08T02', task, 'MAINTENANCE_FAILED')
	);
	await assert.rejects(() =>
		runTrackedJob(jobs, 'maintenance', '2026-09-08T02', task, 'MAINTENANCE_FAILED')
	);
	assert.deepEqual(records, [
		['claim-1', 'failed', 'MAINTENANCE_FAILED'],
		['claim-1', 'failed', 'MAINTENANCE_FAILED']
	]);
	assert.doesNotMatch(JSON.stringify(records), /email|12345|secret/);
});
