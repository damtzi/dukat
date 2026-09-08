import type { OperationalJobRepository } from '@dukat/db/repositories/operational-jobs';

type JobRecorder = Pick<OperationalJobRepository, 'claim' | 'finish'>;

export async function runTrackedJob(
	jobs: JobRecorder,
	name: string,
	scheduledFor: string,
	task: () => Promise<void>,
	errorCode: string
) {
	const claimId = await jobs.claim(name, scheduledFor);
	if (!claimId) return false;
	try {
		await task();
		await jobs.finish(claimId, 'succeeded');
		return true;
	} catch (error) {
		await jobs.finish(claimId, 'failed', errorCode);
		throw error;
	}
}
