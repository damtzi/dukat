import { createAPI } from '@dukat/api';
import { auth, emailSender } from '@dukat/auth';
import { db, financialDb } from '@dukat/db';
import { createFavoriteRepository } from '@dukat/db/repositories/favorites';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { createInsightsRepository } from '@dukat/db/repositories/insights';
import { createPlanningRepository } from '@dukat/db/repositories/planning';
import {
	createExchangeRateRepository,
	createNbpAdapter
} from '@dukat/db/repositories/exchange-rates';
import { serverEnv } from '@dukat/env/server';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';

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
const api = createAPI({
	auth,
	favorites: createFavoriteRepository(db),
	ledger: ledgerRepository,
	planning: createPlanningRepository(financialDb),
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
	isProduction: serverEnv.NODE_ENV === 'production'
});
