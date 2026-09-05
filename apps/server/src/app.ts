import { createAPI, createProfileImageService } from '@dukat/api';
import { auth, emailSender, trustedOrigins } from '@dukat/auth';
import { db, financialDb } from '@dukat/db';
import { createFavoriteRepository } from '@dukat/db/repositories/favorites';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { createInsightsRepository } from '@dukat/db/repositories/insights';
import { createPlanningRepository } from '@dukat/db/repositories/planning';
import { createBudgetRepository } from '@dukat/db/repositories/budgets';
import { createProfileImageCleanupRepository } from '@dukat/db/repositories/profile-image-cleanup';
import {
	createExchangeRateRepository,
	createNbpAdapter
} from '@dukat/db/repositories/exchange-rates';
import { serverEnv } from '@dukat/env/server';
import { resolve } from 'node:path';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';
import { createProfileImageCleanup } from './profile-image-cleanup';
import { createProfileImageStorage } from './profile-image-storage';

const workspaceRepository = createWorkspaceRepository(db);
type OutboxRepository = Pick<
	typeof workspaceRepository,
	'claimPendingOutbox' | 'isOutboxClaimActive' | 'markOutboxSent' | 'markOutboxFailed'
>;

export function createOutboxDelivery(
	repository: OutboxRepository,
	sender: typeof emailSender,
	onError: (error: unknown) => void,
	onTerminalFailure: (id: string) => void
) {
	let activeDrain: Promise<void> | undefined;
	const run = async () => {
		for (;;) {
			const message = await repository.claimPendingOutbox();
			if (!message?.body) return;
			const claim = await repository.isOutboxClaimActive(message.id, message.attempts);
			if (claim.terminal) onTerminalFailure(message.id);
			if (!claim.active) continue;
			try {
				await sender.send({
					to: message.to,
					subject: message.subject,
					text: message.body,
					idempotencyKey: `dukat-invitation/${message.id}`
				});
				await repository.markOutboxSent(message.id, message.attempts);
			} catch {
				const failed = await repository.markOutboxFailed(message.id, message.attempts);
				if (failed.terminal) onTerminalFailure(message.id);
			}
		}
	};
	return {
		deliver() {
			if (!activeDrain) {
				activeDrain = run()
					.catch(onError)
					.finally(() => {
						activeDrain = undefined;
					});
			}
			return activeDrain;
		},
		async waitForIdle(timeoutMs: number) {
			if (!activeDrain) return;
			await Promise.race([
				activeDrain,
				new Promise<void>((resolve) => {
					const timeout = setTimeout(resolve, timeoutMs);
					timeout.unref();
				})
			]);
		}
	};
}

const logOutboxError = (event: string, details: object) =>
	process.stderr.write(`${JSON.stringify({ level: 'error', event, ...details })}\n`);
const outboxDelivery = createOutboxDelivery(
	workspaceRepository,
	emailSender,
	(error) =>
		logOutboxError('outbox.drain_failed', {
			errorName: error instanceof Error ? error.name : 'UnknownError'
		}),
	(id) => logOutboxError('outbox.delivery_abandoned', { outboxId: id })
);
const workspaceService = {
	...workspaceRepository,
	deliverOutbox: () => outboxDelivery.deliver()
};

const outboxTimer = setInterval(() => void workspaceService.deliverOutbox(), 60_000);
outboxTimer.unref();
void workspaceService.deliverOutbox();

export async function shutdownOutbox() {
	clearInterval(outboxTimer);
	clearInterval(exchangeRateTimer);
	await outboxDelivery.waitForIdle(5_000);
}

const ledgerRepository = createLedgerRepository(financialDb);
const nbp = createNbpAdapter();
const exchangeRateRepository = createExchangeRateRepository(financialDb, nbp);
const refreshRates = () =>
	(exchangeRateRepository.refreshLatest() ?? Promise.resolve()).catch((error) =>
		logOutboxError('exchange_rates.refresh_failed', {
			errorName: error instanceof Error ? error.name : 'UnknownError'
		})
	);
const exchangeRateTimer = setInterval(() => void refreshRates(), 60 * 60 * 1000);
exchangeRateTimer.unref();
void refreshRates();
const profileImageStorage = createProfileImageStorage({
	nodeEnv: serverEnv.NODE_ENV,
	localDirectory: resolve(serverEnv.PROFILE_IMAGE_DIRECTORY),
	s3:
		serverEnv.NODE_ENV === 'production'
			? {
					endpoint: serverEnv.PROFILE_IMAGE_S3_ENDPOINT!,
					region: serverEnv.PROFILE_IMAGE_S3_REGION!,
					accessKeyId: serverEnv.PROFILE_IMAGE_S3_ACCESS_KEY_ID!,
					secretAccessKey: serverEnv.PROFILE_IMAGE_S3_SECRET_ACCESS_KEY!,
					bucket: serverEnv.PROFILE_IMAGE_S3_BUCKET!,
					publicBaseUrl: serverEnv.PROFILE_IMAGE_PUBLIC_BASE_URL!
				}
			: undefined
});
const profileImageCleanup = createProfileImageCleanup({
	repository: createProfileImageCleanupRepository(db),
	storage: profileImageStorage.storage
});
const drainProfileImages = () =>
	profileImageCleanup.drain().catch((error) =>
		logOutboxError('profile_image_cleanup.drain_failed', {
			errorName: error instanceof Error ? error.name : 'UnknownError'
		})
	);
void drainProfileImages();
const api = createAPI({
	auth,
	trustedOrigins,
	favorites: createFavoriteRepository(db),
	profileImageCleanup,
	profileImages: createProfileImageService({
		auth,
		storage: profileImageStorage.storage,
		cleanup: profileImageCleanup
	}),
	ledger: ledgerRepository,
	planning: createPlanningRepository(financialDb),
	budgets: createBudgetRepository(financialDb, exchangeRateRepository),
	exchangeRates: exchangeRateRepository,
	insights: createInsightsRepository(financialDb),
	readiness: () => db.run('select 1'),
	workspaces: workspaceService
});

export const app = createServerApp({
	api,
	dashboardDirectory: resolveDashboardDirectory(serverEnv.DASHBOARD_DIRECTORY, {
		production: serverEnv.NODE_ENV === 'production'
	}),
	profileImagesDirectory: profileImageStorage.localDirectory,
	profileImageOrigin: profileImageStorage.publicOrigin,
	isProduction: serverEnv.NODE_ENV === 'production'
});
