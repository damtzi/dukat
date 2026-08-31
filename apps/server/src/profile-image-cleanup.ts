import type { ProfileImageStorage } from '@dukat/api';

interface ProfileImageCleanupRepository {
	enqueue(userId: string, publicUrl: string): Promise<void>;
	listPending(): PromiseLike<Array<{ id: string; userId: string; publicUrl: string }>>;
	complete(id: string): Promise<void>;
	markFailed(id: string, error: string): Promise<void>;
}

export function createProfileImageCleanup(options: {
	repository: ProfileImageCleanupRepository;
	storage: ProfileImageStorage;
}) {
	let activeDrain: Promise<void> | undefined;
	let rerunRequested = false;

	async function run() {
		do {
			rerunRequested = false;
			const jobs = await options.repository.listPending();
			for (const job of jobs) {
				try {
					await options.storage.remove(job.userId, job.publicUrl);
					await options.repository.complete(job.id);
				} catch (error) {
					await options.repository.markFailed(
						job.id,
						error instanceof Error ? error.message : 'Unknown cleanup failure'
					);
				}
			}
		} while (rerunRequested);
	}

	return {
		enqueue(userId: string, publicUrl: string) {
			return options.repository.enqueue(userId, publicUrl);
		},
		drain() {
			if (activeDrain) {
				rerunRequested = true;
				return activeDrain;
			}
			activeDrain = run().finally(() => {
				activeDrain = undefined;
			});
			return activeDrain;
		}
	};
}
