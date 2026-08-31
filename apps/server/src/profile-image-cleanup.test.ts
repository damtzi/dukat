import assert from 'node:assert/strict';
import test from 'node:test';

import { createProfileImageCleanup } from './profile-image-cleanup';

test('profile-image cleanup retries durable jobs after a new drain', async () => {
	const jobs: Array<{
		id: string;
		userId: string;
		publicUrl: string;
		attempts: number;
		lastAttemptAt: Date | null;
		lastError: string | null;
		createdAt: Date;
	}> = [
		{
			id: 'job-1',
			userId: 'user-1',
			publicUrl: '/profile-images/users/scope/image.webp',
			attempts: 0,
			lastAttemptAt: null,
			lastError: null,
			createdAt: new Date()
		}
	];
	const repository = {
		async enqueue(userId: string, publicUrl: string) {
			jobs.push({
				id: `job-${jobs.length + 1}`,
				userId,
				publicUrl,
				attempts: 0,
				lastAttemptAt: null,
				lastError: null,
				createdAt: new Date()
			});
		},
		async listPending() {
			return [...jobs];
		},
		async complete(id: string) {
			jobs.splice(
				jobs.findIndex((job) => job.id === id),
				1
			);
		},
		async markFailed(id: string, message: string) {
			const job = jobs.find((candidate) => candidate.id === id)!;
			job.attempts += 1;
			job.lastAttemptAt = new Date();
			job.lastError = message;
		}
	};
	let available = false;
	const removed: string[] = [];
	const storage = {
		async store() {
			return '';
		},
		async remove(_userId: string, publicUrl: string) {
			if (!available) throw new Error('storage unavailable');
			removed.push(publicUrl);
		}
	};

	await createProfileImageCleanup({ repository, storage }).drain();
	assert.equal(jobs[0].attempts, 1);
	assert.equal(jobs[0].lastError, 'storage unavailable');

	available = true;
	await createProfileImageCleanup({ repository, storage }).drain();
	assert.deepEqual(removed, ['/profile-images/users/scope/image.webp']);
	assert.deepEqual(jobs, []);
});
