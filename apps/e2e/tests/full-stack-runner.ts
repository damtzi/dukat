import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { DEMO_CREDENTIALS, seedDatabase } from '../../../packages/db/src/seed';
import { createDatabase } from '../../../packages/db/src/connection';
import {
	account,
	netWorthSnapshot,
	user,
	workspace,
	workspaceMembership
} from '../../../packages/db/src/schema';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const children: ChildProcess[] = [];
const executable = (name: string) => resolve(repositoryRoot, 'node_modules/.bin', name);

async function availablePorts(count: number) {
	const servers = Array.from({ length: count }, () => createServer());
	try {
		await Promise.all(
			servers.map(
				(server) =>
					new Promise<void>((resolveReady, reject) => {
						server.once('error', reject);
						server.listen(0, '127.0.0.1', resolveReady);
					})
			)
		);
		return servers.map((server) => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				throw new Error('Could not allocate a test port.');
			}
			return address.port;
		});
	} finally {
		await Promise.all(
			servers.map(
				(server) =>
					new Promise<void>((resolveClosed, reject) => {
						if (!server.listening) return resolveClosed();
						server.close((error) => (error ? reject(error) : resolveClosed()));
					})
			)
		);
	}
}

function start(
	command: string,
	args: string[],
	environment: NodeJS.ProcessEnv,
	workingDirectory = repositoryRoot
) {
	const child = spawn(command, args, {
		cwd: workingDirectory,
		env: environment,
		stdio: 'inherit',
		detached: process.platform !== 'win32'
	});
	children.push(child);
	return child;
}

function stop(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	try {
		process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
	}
}

async function stopChildren() {
	for (const child of [...children].reverse()) stop(child);
	const stopped = Promise.all(
		children.map(
			(child) =>
				new Promise<void>((resolveStopped) => {
					if (child.exitCode !== null || child.signalCode !== null) return resolveStopped();
					child.once('exit', () => resolveStopped());
				})
		)
	);
	let timeout: NodeJS.Timeout | undefined;
	const stoppedInTime = await Promise.race([
		stopped.then(() => true),
		new Promise<false>((resolveTimeout) => {
			timeout = setTimeout(() => resolveTimeout(false), 5_000);
		})
	]);
	if (timeout) clearTimeout(timeout);
	if (stoppedInTime) return;
	for (const child of [...children].reverse()) stop(child, 'SIGKILL');
	await stopped;
}

async function waitFor(url: string, child: ChildProcess, name: string) {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error(`${name} stopped before it became ready.`);
		}
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The service is still starting.
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 200));
	}
	throw new Error(`${name} did not become ready within 30 seconds.`);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'dukat-full-stack-'));
const databaseUrl = `file:${join(temporaryDirectory, 'dukat.db')}`;
const [apiPort, dashboardPort] = await availablePorts(2);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const dashboardOrigin = `http://127.0.0.1:${dashboardPort}`;
const outputDirectory = join(repositoryRoot, 'apps/e2e/test-results', `full-stack-${randomUUID()}`);
await mkdir(join(temporaryDirectory, 'dashboard'), { recursive: true });
await mkdir(join(temporaryDirectory, 'profile-images'), { recursive: true });

const environment = {
	...process.env,
	NODE_ENV: 'test',
	LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
	PORT: String(apiPort),
	DASHBOARD_DIRECTORY: join(temporaryDirectory, 'dashboard'),
	PROFILE_IMAGE_DIRECTORY: join(temporaryDirectory, 'profile-images'),
	TURSO_DATABASE_URL: databaseUrl,
	TURSO_AUTH_TOKEN: '',
	BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
	BETTER_AUTH_URL: dashboardOrigin,
	CORS_ORIGIN: dashboardOrigin,
	RESEND_API_KEY: 'full-stack-test-key',
	AUTH_EMAIL_FROM: 'Dukat tests <tests@dukat.local>',
	DUKAT_API_ORIGIN: apiOrigin,
	FULL_STACK_BASE_URL: dashboardOrigin,
	FULL_STACK_OUTPUT_DIR: outputDirectory,
	FULL_STACK_TEST_EMAIL: DEMO_CREDENTIALS.email,
	FULL_STACK_TEST_PASSWORD: DEMO_CREDENTIALS.password,
	FULL_STACK_TEST_WORKSPACE_ID: 'seed-demo-workspace',
	FULL_STACK_MEMBER_EMAIL: 'member@dukat.local',
	FULL_STACK_MEMBER_PASSWORD: 'Member-test-password-56',
	FULL_STACK_HOUSEHOLD_ID: 'full-stack-household'
};

let receivedSignal: NodeJS.Signals | undefined;
const handleSignal = (signal: NodeJS.Signals) => {
	receivedSignal = signal;
	for (const child of [...children].reverse()) stop(child);
};
process.once('SIGINT', () => handleSignal('SIGINT'));
process.once('SIGTERM', () => handleSignal('SIGTERM'));

let exitCode = 1;
let failure: unknown;
try {
	await seedDatabase({ url: databaseUrl });
	const setup = createDatabase({ url: databaseUrl });
	try {
		await setup.db.insert(user).values({
			id: 'full-stack-member',
			name: 'Household Member',
			username: 'household_member',
			email: environment.FULL_STACK_MEMBER_EMAIL,
			emailVerified: true
		});
		await setup.db.insert(account).values({
			id: 'full-stack-member-credential',
			accountId: 'full-stack-member',
			providerId: 'credential',
			userId: 'full-stack-member',
			password: await hashPassword(environment.FULL_STACK_MEMBER_PASSWORD)
		});
		await setup.db.insert(workspace).values({
			id: environment.FULL_STACK_HOUSEHOLD_ID,
			name: 'Full-stack Household',
			type: 'household',
			reportingCurrency: 'PLN'
		});
		await setup.db.insert(workspaceMembership).values([
			{
				workspaceId: environment.FULL_STACK_HOUSEHOLD_ID,
				userId: 'seed-demo-user',
				role: 'owner'
			},
			{
				workspaceId: environment.FULL_STACK_HOUSEHOLD_ID,
				userId: 'full-stack-member',
				role: 'member'
			}
		]);
		const historyPayload = (date: string, balanceMinor: string, rateToPln: string) => {
			const convertedBalanceMinor = (
				(BigInt(balanceMinor) * BigInt(rateToPln.replace('.', ''))) /
				10n
			).toString();
			const total = { amountMinor: convertedBalanceMinor, missingRate: false };
			return {
				date,
				reportingCurrency: 'PLN',
				personalNetWorth: total,
				householdNetWorth: { amountMinor: '20000', missingRate: false },
				combinedNetWorth: {
					amountMinor: (BigInt(convertedBalanceMinor) + 20000n).toString(),
					missingRate: false
				},
				workspaces: [
					{
						id: environment.FULL_STACK_TEST_WORKSPACE_ID,
						name: 'Personal',
						type: 'personal',
						netWorthMinor: convertedBalanceMinor,
						missingRate: false,
						accounts: [
							{
								id: 'historical-eur-cash',
								name: 'Historical EUR cash',
								type: 'cash',
								currency: 'EUR',
								balanceMinor,
								convertedBalanceMinor,
								rates: [
									{
										currency: 'EUR',
										rateToPln,
										source: 'manual',
										effectiveDate: date,
										tableNumber: null,
										manualOverrideId: `history-rate-${date}`,
										reason: 'Full-stack history fixture',
										actorDisplay: 'Demo User'
									}
								]
							}
						]
					},
					{
						id: environment.FULL_STACK_HOUSEHOLD_ID,
						name: 'Full-stack Household',
						type: 'household',
						netWorthMinor: '20000',
						missingRate: false,
						accounts: []
					}
				]
			};
		};
		await setup.db.insert(netWorthSnapshot).values([
			{
				id: 'full-stack-history-1',
				userId: 'seed-demo-user',
				date: '2026-08-30',
				payloadJson: JSON.stringify(historyPayload('2026-08-30', '10000', '4.2'))
			},
			{
				id: 'full-stack-history-2',
				userId: 'seed-demo-user',
				date: '2026-08-31',
				payloadJson: JSON.stringify(historyPayload('2026-08-31', '10000', '4.3'))
			},
			{
				id: 'full-stack-member-history',
				userId: 'full-stack-member',
				date: '2026-08-30',
				payloadJson: JSON.stringify({
					...historyPayload('2026-08-30', '10000', '4.2'),
					personalNetWorth: { amountMinor: '0', missingRate: false },
					combinedNetWorth: { amountMinor: '20000', missingRate: false },
					workspaces: historyPayload('2026-08-30', '10000', '4.2').workspaces.slice(1)
				})
			}
		]);
	} finally {
		setup.client.close();
	}
	if (receivedSignal) throw new Error(`Full-stack test interrupted by ${receivedSignal}.`);
	const api = start(
		executable('tsx'),
		['src/index.ts'],
		environment,
		join(repositoryRoot, 'apps/server')
	);
	await waitFor(`${apiOrigin}/api/health/ready`, api, 'Hono API');
	const dashboard = start(
		executable('vite'),
		['dev', '--host', '127.0.0.1', '--port', String(dashboardPort), '--strictPort'],
		environment,
		join(repositoryRoot, 'apps/dashboard')
	);
	await waitFor(`${dashboardOrigin}/api/health/ready`, dashboard, 'SvelteKit test server');
	const playwright = start(
		executable('playwright'),
		['test', '--config', 'playwright.full-stack.config.ts'],
		environment,
		join(repositoryRoot, 'apps/e2e')
	);
	exitCode = await new Promise<number>((resolveExit, reject) => {
		playwright.once('error', reject);
		playwright.once('exit', (code) => resolveExit(code ?? 1));
	});
} catch (error) {
	failure = error;
} finally {
	await stopChildren();
	await rm(temporaryDirectory, { recursive: true, force: true });
}

if (failure && !receivedSignal) throw failure;
process.exitCode =
	receivedSignal === 'SIGINT' ? 130 : receivedSignal === 'SIGTERM' ? 143 : exitCode;
