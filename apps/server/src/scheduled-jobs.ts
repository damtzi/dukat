import type { OperationalJobRepository } from '@dukat/db/repositories/operational-jobs';
import { createLogicalBackup, encryptLogicalBackup } from '@dukat/db/recovery';

type JobRecorder = Pick<OperationalJobRepository, 'claim' | 'finish'>;

export interface BackupBucket {
	put(
		key: string,
		value: string,
		options: { httpMetadata: { contentType: string }; customMetadata: { createdAt: string } }
	): Promise<unknown>;
}

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

export function runDailyBackup(options: {
	client: Parameters<typeof createLogicalBackup>[0];
	jobs: JobRecorder;
	bucket: BackupBucket;
	encryptionKey: string;
	now: Date;
}) {
	const date = options.now.toISOString().slice(0, 10);
	return runTrackedJob(
		options.jobs,
		'database-backup',
		date,
		async () => {
			const encrypted = encryptLogicalBackup(
				await createLogicalBackup(options.client),
				options.encryptionKey
			);
			await options.bucket.put(`daily/${date}.backup.json`, encrypted, {
				httpMetadata: { contentType: 'application/json' },
				customMetadata: { createdAt: options.now.toISOString() }
			});
		},
		'BACKUP_FAILED'
	);
}
