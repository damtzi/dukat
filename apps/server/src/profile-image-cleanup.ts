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
	let activeDrain: Promise<number> | undefined;
	let rerunRequested = false;

	async function run() {
		let failures = 0;
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
					failures += 1;
				}
			}
		} while (rerunRequested);
		return failures;
	}
	const drainWithFailureCount = () => {
		if (activeDrain) {
			rerunRequested = true;
			return activeDrain;
		}
		activeDrain = run().finally(() => {
			activeDrain = undefined;
		});
		return activeDrain;
	};

	return {
		enqueue(userId: string, publicUrl: string) {
			return options.repository.enqueue(userId, publicUrl);
		},
		drain() {
			return drainWithFailureCount().then(() => undefined);
		},
		drainWithFailureCount
	};
}
