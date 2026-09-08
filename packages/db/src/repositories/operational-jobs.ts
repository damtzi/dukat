import { and, desc, eq, lte, or, sql } from 'drizzle-orm';

import type { Database } from '../connection';
import { operationalJob } from '../schema/operations';

const STALE_JOB_MS = 2 * 60 * 60 * 1_000;

export function createOperationalJobRepository(database: Database) {
	return {
		async claim(name: string, scheduledFor: string, now = new Date()) {
			const claimId: string = crypto.randomUUID();
			const claimed = await database
				.insert(operationalJob)
				.values({
					id: claimId,
					name,
					scheduledFor,
					status: 'running',
					startedAt: now
				})
				.onConflictDoUpdate({
					target: [operationalJob.name, operationalJob.scheduledFor],
					set: {
						id: claimId,
						status: 'running',
						attempts: sql`${operationalJob.attempts} + 1`,
						startedAt: now,
						finishedAt: null,
						errorCode: null
					},
					setWhere: or(
						eq(operationalJob.status, 'failed'),
						and(
							eq(operationalJob.status, 'running'),
							lte(operationalJob.startedAt, new Date(now.getTime() - STALE_JOB_MS))
						)
					)
				})
				.returning({ id: operationalJob.id });
			return claimed.length > 0 ? claimId : null;
		},
		async finish(
			claimId: string,
			status: 'succeeded' | 'failed',
			errorCode?: string,
			now = new Date()
		) {
			await database
				.update(operationalJob)
				.set({ status, errorCode: errorCode ?? null, finishedAt: now })
				.where(and(eq(operationalJob.id, claimId), eq(operationalJob.status, 'running')));
		},
		listRecent(limit = 50) {
			return database
				.select({
					name: operationalJob.name,
					scheduledFor: operationalJob.scheduledFor,
					status: operationalJob.status,
					attempts: operationalJob.attempts,
					startedAt: operationalJob.startedAt,
					finishedAt: operationalJob.finishedAt,
					errorCode: operationalJob.errorCode
				})
				.from(operationalJob)
				.orderBy(desc(operationalJob.startedAt))
				.limit(limit);
		}
	};
}

export type OperationalJobRepository = ReturnType<typeof createOperationalJobRepository>;
