import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { createDatabase } from '../connection';
import { profileImageCleanupJob, user } from '../schema';
import { createProfileImageCleanupRepository } from './profile-image-cleanup';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

test('profile-image cleanup jobs survive retries and process restart', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-cleanup-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	try {
		await migrate(connection.db, { migrationsFolder });
		await connection.db.insert(user).values({
			id: 'user-1',
			name: 'Image User',
			username: 'image_user',
			email: 'image@example.com',
			image: '/profile-images/users/scope/old.webp'
		});

		await connection.db
			.update(user)
			.set({ image: '/profile-images/users/scope/new.webp' })
			.where(eq(user.id, 'user-1'));
		let repository = createProfileImageCleanupRepository(connection.db);
		let [job] = await repository.listPending();
		assert.deepEqual(
			{ userId: job.userId, publicUrl: job.publicUrl, attempts: job.attempts },
			{
				userId: 'user-1',
				publicUrl: '/profile-images/users/scope/old.webp',
				attempts: 0
			}
		);

		await repository.markFailed(job.id, 'storage unavailable');
		repository = createProfileImageCleanupRepository(connection.db);
		[job] = await repository.listPending();
		assert.equal(job.attempts, 1);
		assert.equal(job.lastError, 'storage unavailable');

		await repository.enqueue('user-1', job.publicUrl);
		assert.equal((await repository.listPending()).length, 1, 'duplicate enqueue is harmless');
		await repository.complete(job.id);
		assert.deepEqual(await repository.listPending(), []);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('image removal and account deletion record the last referenced object atomically', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-profile-cleanup-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	try {
		await migrate(connection.db, { migrationsFolder });
		await connection.db.insert(user).values([
			{
				id: 'removed-image',
				name: 'Removed Image',
				username: 'removed_image',
				email: 'removed@example.com',
				image: '/profile-images/users/removed/image.webp'
			},
			{
				id: 'deleted-account',
				name: 'Deleted Account',
				username: 'deleted_account',
				email: 'deleted@example.com',
				image: '/profile-images/users/deleted/image.webp'
			}
		]);

		await connection.db.update(user).set({ image: null }).where(eq(user.id, 'removed-image'));
		await connection.db.delete(user).where(eq(user.id, 'deleted-account'));

		assert.deepEqual(
			(await connection.db.select().from(profileImageCleanupJob))
				.map(({ userId, publicUrl }) => ({ userId, publicUrl }))
				.sort((a, b) => a.userId.localeCompare(b.userId)),
			[
				{
					userId: 'deleted-account',
					publicUrl: '/profile-images/users/deleted/image.webp'
				},
				{
					userId: 'removed-image',
					publicUrl: '/profile-images/users/removed/image.webp'
				}
			]
		);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
