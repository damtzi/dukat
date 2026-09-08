import { createAPI, createProfileImageService } from '@dukat/api';
import { createAuth } from '@dukat/auth/create-auth';
import { createResendEmailSender } from '@dukat/auth/email';
import { createDatabase, createFinancialDatabase } from '@dukat/db/connection';
import { createBudgetRepository } from '@dukat/db/repositories/budgets';
import {
	createExchangeRateRepository,
	createNbpAdapter
} from '@dukat/db/repositories/exchange-rates';
import { createFavoriteRepository } from '@dukat/db/repositories/favorites';
import { createInsightsRepository } from '@dukat/db/repositories/insights';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { createNetWorthHistoryRepository } from '@dukat/db/repositories/net-worth-history';
import { createOverviewRepository } from '@dukat/db/repositories/overview';
import { createPlanningRepository } from '@dukat/db/repositories/planning';
import { createProfileImageCleanupRepository } from '@dukat/db/repositories/profile-image-cleanup';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { createAdministrationRepository } from '@dukat/db/repositories/administration';
import { createWorkerEnv } from '@dukat/env/worker';

import {
	createCloudflareProfileImageNormalizer,
	createR2ProfileImageStorage,
	type ProfileImageBucket
} from './cloudflare-profile-images';
import { createProfileImageCleanup } from './profile-image-cleanup';

interface WorkerEnv {
	ASSETS: { fetch(request: Request): Promise<Response> };
	PROFILE_IMAGES: ProfileImageBucket & {
		get(key: string): Promise<{
			body: ReadableStream<Uint8Array>;
			httpEtag: string;
			httpMetadata?: { cacheControl?: string; contentType?: string };
		} | null>;
	};
	IMAGES: Parameters<typeof createCloudflareProfileImageNormalizer>[0];
	NODE_ENV: 'production';
	LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	TURSO_DATABASE_URL: string;
	TURSO_AUTH_TOKEN: string;
	RESEND_API_KEY: string;
	AUTH_EMAIL_FROM: string;
	AUTH_ADMIN_EMAILS?: string;
}

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
}

function variables(env: WorkerEnv) {
	return {
		NODE_ENV: env.NODE_ENV,
		LOG_LEVEL: env.LOG_LEVEL,
		BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: env.BETTER_AUTH_URL,
		TURSO_DATABASE_URL: env.TURSO_DATABASE_URL,
		TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN,
		RESEND_API_KEY: env.RESEND_API_KEY,
		AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
		AUTH_ADMIN_EMAILS: env.AUTH_ADMIN_EMAILS
	};
}

type OutboxRepository = ReturnType<typeof createWorkspaceRepository>;

function logError(event: string, error: unknown) {
	console.error(
		JSON.stringify({
			level: 'error',
			event,
			errorName: error instanceof Error ? error.name : 'UnknownError'
		})
	);
}

function createOutboxDrain(
	repository: OutboxRepository,
	sender: ReturnType<typeof createResendEmailSender>
) {
	let active: Promise<void> | undefined;
	const run = async () => {
		for (;;) {
			const message = await repository.claimPendingOutbox();
			if (!message?.body) return;
			const claim = await repository.isOutboxClaimActive(message.id, message.attempts);
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
				await repository.markOutboxFailed(message.id, message.attempts);
			}
		}
	};
	return () => {
		active ??= run().finally(() => {
			active = undefined;
		});
		return active;
	};
}

function secure(response: Response) {
	const secured = new Response(response.body, response);
	secured.headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=()');
	secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	secured.headers.set('strict-transport-security', 'max-age=15552000; includeSubDomains');
	secured.headers.set('x-content-type-options', 'nosniff');
	secured.headers.set('x-frame-options', 'DENY');
	return secured;
}

function createRuntime(bindings: WorkerEnv) {
	const env = createWorkerEnv(variables(bindings));
	const connection = createDatabase({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN
	});
	const financialConnection = createFinancialDatabase({
		url: env.TURSO_DATABASE_URL,
		authToken: env.TURSO_AUTH_TOKEN
	});
	const db = connection.db;
	const financialDb = financialConnection.db;
	const emailSender = createResendEmailSender(env.RESEND_API_KEY, env.AUTH_EMAIL_FROM);
	const administration = createAdministrationRepository(db);
	const auth = createAuth({
		database: db,
		baseURL: env.BETTER_AUTH_URL,
		secret: env.BETTER_AUTH_SECRET,
		emailSender,
		isProduction: true,
		registrationOpen: administration.registrationOpen,
		administratorEmails: env.AUTH_ADMIN_EMAILS.split(',').filter(Boolean)
	});
	const workspaceRepository = createWorkspaceRepository(db);
	const drainOutbox = createOutboxDrain(workspaceRepository, emailSender);
	const workspaceService = { ...workspaceRepository, deliverOutbox: drainOutbox };
	const ledger = createLedgerRepository(financialDb);
	const planning = createPlanningRepository(financialDb);
	const insights = createInsightsRepository(financialDb);
	const exchangeRates = createExchangeRateRepository(financialDb, createNbpAdapter());
	const history = createNetWorthHistoryRepository({
		database: financialDb,
		workspaces: workspaceRepository,
		ledger,
		exchangeRates
	});
	const storage = createR2ProfileImageStorage(bindings.PROFILE_IMAGES);
	const profileImageCleanup = createProfileImageCleanup({
		repository: createProfileImageCleanupRepository(db),
		storage
	});
	const api = createAPI(
		{
			administration,
			auth,
			trustedOrigins: [],
			favorites: createFavoriteRepository(db),
			profileImageCleanup,
			profileImages: createProfileImageService({
				auth,
				storage,
				cleanup: profileImageCleanup,
				normalize: createCloudflareProfileImageNormalizer(bindings.IMAGES)
			}),
			ledger,
			planning,
			budgets: createBudgetRepository(financialDb, exchangeRates),
			exchangeRates,
			insights,
			overview: createOverviewRepository({
				workspaces: workspaceRepository,
				ledger,
				planning,
				insights,
				exchangeRates,
				history
			}),
			readiness: () => db.run('select 1'),
			workspaces: workspaceService
		},
		{ logLevel: env.LOG_LEVEL }
	);

	return {
		api,
		drainBackground: () => Promise.all([drainOutbox(), profileImageCleanup.drain()]),
		async maintain() {
			await workspaceRepository.purgeExpired();
			await administration.purgeExpiredAccounts();
			await exchangeRates.refreshLatest();
			const failures = await history.recordAll();
			if (failures.length) {
				console.error(
					JSON.stringify({
						level: 'error',
						event: 'net_worth_snapshot.users_failed',
						count: failures.length
					})
				);
			}
			await Promise.all([drainOutbox(), profileImageCleanup.drain()]);
		}
	};
}

let runtime: ReturnType<typeof createRuntime> | undefined;

async function profileImageResponse(request: Request, env: WorkerEnv) {
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
	}
	const key = new URL(request.url).pathname.slice('/profile-images/'.length);
	if (!key) return new Response('Not Found', { status: 404 });
	const object = await env.PROFILE_IMAGES.get(key);
	if (!object) return new Response('Not Found', { status: 404 });
	return new Response(request.method === 'HEAD' ? null : object.body, {
		headers: {
			'cache-control': object.httpMetadata?.cacheControl ?? 'public, max-age=31536000, immutable',
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			etag: object.httpEtag
		}
	});
}

export default {
	async fetch(request: Request, env: WorkerEnv, context: ExecutionContext) {
		const configured = createWorkerEnv(variables(env));
		if (new URL(request.url).origin !== configured.BETTER_AUTH_URL) {
			return secure(new Response('Worker origin does not match BETTER_AUTH_URL.', { status: 500 }));
		}
		runtime ??= createRuntime(env);
		const pathname = new URL(request.url).pathname;
		let response: Response;
		if (pathname.startsWith('/api/')) {
			response = await runtime.api.fetch(request);
			response.headers.set('cache-control', 'no-store');
			context.waitUntil(
				runtime.drainBackground().catch((error) => logError('background.drain_failed', error))
			);
		} else if (pathname.startsWith('/profile-images/')) {
			response = await profileImageResponse(request, env);
		} else {
			const assetRequest =
				pathname === '/admin' || pathname === '/admin/'
					? new Request(new URL('/admin/index.html', request.url), request)
					: request;
			response = await env.ASSETS.fetch(assetRequest);
		}
		return secure(response);
	},
	async scheduled(_controller: unknown, env: WorkerEnv, context: ExecutionContext) {
		runtime ??= createRuntime(env);
		context.waitUntil(runtime.maintain().catch((error) => logError('maintenance.failed', error)));
	}
};
