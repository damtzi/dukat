import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import type { Database } from '../connection';
import { profileImageCleanupJob } from '../schema';

export function createProfileImageCleanupRepository(database: Database) {
	return {
		async enqueue(userId: string, publicUrl: string) {
			await database
				.insert(profileImageCleanupJob)
				.values({ id: randomUUID(), userId, publicUrl })
				.onConflictDoNothing({
					target: [profileImageCleanupJob.userId, profileImageCleanupJob.publicUrl]
				});
		},
		listPending() {
			return database
				.select()
				.from(profileImageCleanupJob)
				.orderBy(profileImageCleanupJob.createdAt);
		},
		async complete(id: string) {
			await database.delete(profileImageCleanupJob).where(eq(profileImageCleanupJob.id, id));
		},
		async markFailed(id: string, error: string) {
			await database
				.update(profileImageCleanupJob)
				.set({
					attempts: sql`${profileImageCleanupJob.attempts} + 1`,
					lastAttemptAt: new Date(),
					lastError: error
				})
				.where(eq(profileImageCleanupJob.id, id));
		}
	};
}
