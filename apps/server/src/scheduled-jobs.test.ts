import assert from 'node:assert/strict';
import test from 'node:test';

import { runDailyBackup } from './scheduled-jobs';

test('daily backup encrypts one logical export and records only operational metadata', async () => {
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
	const uploads: { key: string; value: string }[] = [];
	const now = new Date('2026-09-08T02:17:00.000Z');
	const client = {
		async transaction() {
			return {
				closed: false,
				async execute() {
					return {
						columns: ['type', 'name', 'sql'],
						rows: [{ type: 'table', name: 'example', sql: 'CREATE TABLE example (id text)' }]
					};
				},
				async batch() {
					return [{ columns: ['id'], rows: [{ id: 'financial-value' }] }];
				},
				async commit() {},
				async rollback() {},
				close() {}
			};
		}
	} as never;
	const options = {
		client,
		jobs,
		bucket: {
			async put(key: string, value: string) {
				uploads.push({ key, value });
			}
		},
		encryptionKey: Buffer.alloc(32, 7).toString('base64'),
		now
	};

	assert.equal(await runDailyBackup(options), true);
	assert.equal(await runDailyBackup(options), false);
	assert.equal(uploads.length, 1);
	assert.equal(uploads[0]?.key, 'daily/2026-09-08.backup.json');
	assert.doesNotMatch(uploads[0]?.value ?? '', /financial-value/);
	assert.deepEqual(records, [['claim-1', 'succeeded']]);
});

test('failed backup is visible through a privacy-safe code and can retry', async () => {
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
	const options = {
		client: {
			async transaction() {
				throw new Error('email@example.com 12345 secret');
			}
		} as never,
		jobs,
		bucket: { async put() {} },
		encryptionKey: Buffer.alloc(32, 7).toString('base64'),
		now: new Date('2026-09-08T02:17:00.000Z')
	};

	await assert.rejects(() => runDailyBackup(options));
	await assert.rejects(() => runDailyBackup(options));
	assert.deepEqual(records, [
		['claim-1', 'failed', 'BACKUP_FAILED'],
		['claim-1', 'failed', 'BACKUP_FAILED']
	]);
	assert.doesNotMatch(JSON.stringify(records), /email|12345|secret/);
});
