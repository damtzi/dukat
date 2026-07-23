import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { eq } from 'drizzle-orm';

import {
	checkDatabase,
	createDatabase,
	createEncryptedBackup,
	migrateDatabase,
	restoreEncryptedBackup,
	user,
	workspace,
	workspaceMember
} from './index';

const directories: string[] = [];

after(async () => {
	await Promise.all(
		directories.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

async function isolatedDatabase(name: string) {
	const directory = await mkdtemp(join(tmpdir(), `dukat-${name}-`));
	directories.push(directory);
	const database = createDatabase({ url: `file:${join(directory, 'database.db')}` });
	await migrateDatabase(database);
	return database;
}

test('the complete migration chain creates an empty, healthy database', async () => {
	const database = await isolatedDatabase('migrations');
	const integrity = await checkDatabase(database);
	assert.equal(integrity.ok, true);
	assert.equal((await database.select().from(user)).length, 0);
	assert.equal((await database.select().from(workspace)).length, 0);
});

test('an encrypted logical backup restores into a new healthy database', async () => {
	const source = await isolatedDatabase('backup-source');
	const now = '2026-01-02T03:04:05.000Z';
	await source.insert(user).values({
		id: 'user-1',
		name: 'Ada Lovelace',
		email: 'ada@example.com',
		emailVerified: true,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	});
	const [sourceWorkspace] = await source
		.select({ id: workspace.id })
		.from(workspace)
		.where(eq(workspace.ownerUserId, 'user-1'));
	assert.ok(sourceWorkspace);
	assert.equal(
		(
			await source
				.select()
				.from(workspaceMember)
				.where(eq(workspaceMember.workspaceId, sourceWorkspace.id))
		).length,
		1
	);

	const key = Buffer.alloc(32, 7).toString('base64');
	const encryptedBackup = await createEncryptedBackup(source, key);
	assert.doesNotMatch(encryptedBackup.toString('utf8'), /ada@example\.com/);

	const restored = await isolatedDatabase('backup-restored');
	await restoreEncryptedBackup(restored, encryptedBackup, key);
	const integrity = await checkDatabase(restored);
	assert.equal(integrity.ok, true);
	assert.equal((await restored.select().from(user).where(eq(user.id, 'user-1'))).length, 1);
	assert.deepEqual(
		await restored
			.select({ id: workspace.id, ownerUserId: workspace.ownerUserId })
			.from(workspace)
			.where(eq(workspace.id, sourceWorkspace.id)),
		[{ id: sourceWorkspace.id, ownerUserId: 'user-1' }]
	);
});
