import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase } from '../connection';
import { session, user } from '../schema';
import { createAdministrationRepository } from './administration';

test('administrators manage registration and user access without financial data', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-administration-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{
				id: 'admin',
				name: 'Admin',
				username: 'admin_user',
				email: 'admin@example.com',
				isAdmin: true
			},
			{ id: 'user', name: 'User', username: 'normal_user', email: 'user@example.com' }
		]);
		await connection.db.insert(session).values({
			id: 'session',
			token: 'token',
			userId: 'user',
			expiresAt: new Date(Date.now() + 60_000)
		});
		const repository = createAdministrationRepository(connection.db);

		assert.equal(await repository.registrationOpen(), true);
		assert.deepEqual(await repository.setRegistrationOpen(false), { registrationOpen: false });
		assert.equal(await repository.registrationOpen(), false);
		const users = await repository.listUsers();
		assert.equal(users.length, 2);
		assert.deepEqual(Object.keys(users[0]!).sort(), [
			'createdAt',
			'deletionRequestedAt',
			'disabledAt',
			'email',
			'emailVerified',
			'id',
			'isAdmin',
			'name',
			'username'
		]);

		const disabled = await repository.setUserDisabled('user', true);
		assert.ok(disabled.disabledAt);
		assert.equal((await connection.db.select().from(session)).length, 0);
		assert.equal((await repository.setUserDisabled('user', false)).disabledAt, null);
		await assert.rejects(() => repository.setUserDisabled('admin', true), /cannot be changed/i);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
