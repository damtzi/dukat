import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase } from '../connection';
import { user } from '../schema';
import { createFavoriteRepository } from './favorites';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-favorites-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	await migrate(connection.db, { migrationsFolder });
	await connection.db.insert(user).values([
		{ id: 'user-1', name: 'One', email: 'one@example.com' },
		{ id: 'user-2', name: 'Two', email: 'two@example.com' }
	]);
	return {
		...connection,
		repository: createFavoriteRepository(connection.db),
		async close() {
			connection.client.close();
			await rm(directory, { recursive: true, force: true });
		}
	};
}

test('favorites are ordered, user-scoped, and idempotent by path', async () => {
	const f = await fixture();
	try {
		const overview = await f.repository.add('user-1', {
			path: '/workspaces/one',
			label: 'Home · Overview'
		});
		const account = await f.repository.add('user-1', {
			path: '/workspaces/one/accounts/checking/activity',
			label: 'Home · Checking'
		});
		await f.repository.add('user-2', {
			path: '/workspaces/two',
			label: 'Private'
		});

		const renamed = await f.repository.add('user-1', {
			path: overview.path,
			label: 'House · Overview'
		});
		assert.equal(renamed.id, overview.id);
		assert.deepEqual(await f.repository.list('user-1'), [
			{ ...overview, label: 'House · Overview' },
			account
		]);
		assert.equal((await f.repository.list('user-2')).length, 1);

		await f.repository.remove('user-2', account.id);
		assert.equal((await f.repository.list('user-1')).length, 2);
		await f.repository.remove('user-1', account.id);
		assert.deepEqual(await f.repository.list('user-1'), [renamed]);
	} finally {
		await f.close();
	}
});
