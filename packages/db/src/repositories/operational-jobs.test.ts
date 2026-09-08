import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { createDatabase } from '../connection';
import { createOperationalJobRepository } from './operational-jobs';

test('operational jobs prevent duplicate success and allow failed retries', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-operational-jobs-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		const jobs = createOperationalJobRepository(connection.db);
		const schedule = '2026-09-08';

		const firstClaim = await jobs.claim('database-backup', schedule);
		assert.ok(firstClaim);
		assert.equal(await jobs.claim('database-backup', schedule), null);
		await jobs.finish(firstClaim, 'failed', 'R2_UPLOAD_FAILED');
		const retryClaim = await jobs.claim('database-backup', schedule);
		assert.ok(retryClaim);
		await jobs.finish(retryClaim, 'succeeded');
		assert.equal(await jobs.claim('database-backup', schedule), null);

		assert.deepEqual(await jobs.listRecent(), [
			{
				name: 'database-backup',
				scheduledFor: schedule,
				status: 'succeeded',
				attempts: 2,
				startedAt: (await jobs.listRecent())[0]?.startedAt,
				finishedAt: (await jobs.listRecent())[0]?.finishedAt,
				errorCode: null
			}
		]);

		const staleClaim = await jobs.claim('maintenance', schedule, new Date('2026-09-08T00:00:00Z'));
		assert.ok(staleClaim);
		const replacementClaim = await jobs.claim(
			'maintenance',
			schedule,
			new Date('2026-09-08T03:00:00Z')
		);
		assert.ok(replacementClaim);
		await jobs.finish(staleClaim, 'succeeded', undefined, new Date('2026-09-08T03:01:00Z'));
		assert.equal(
			(await jobs.listRecent()).find((job) => job.name === 'maintenance')?.status,
			'running'
		);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
