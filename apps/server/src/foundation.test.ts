import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAPI } from '@dukat/api';
import { createAuth } from '@dukat/auth/create-auth';
import { createResendEmailSender, type TransactionalEmail } from '@dukat/auth/email';
import { createDatabase, createFinancialDatabase } from '@dukat/db/connection';
import { backupDatabase, restoreDatabase } from '@dukat/db/recovery';
import { session, user } from '@dukat/db/schema/auth';
import { workspace, workspaceMembership } from '@dukat/db/schema/workspaces';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { createInsightsRepository } from '@dukat/db/repositories/insights';
import { createExchangeRateRepository } from '@dukat/db/repositories/exchange-rates';
import { createPlanningRepository } from '@dukat/db/repositories/planning';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';

const origin = 'http://localhost:9999';
const secret = 'test-secret-that-is-at-least-thirty-two-characters';

function cookieFrom(response: Response) {
	const setCookie = response.headers.get('set-cookie');
	assert.ok(setCookie, 'response should set a cookie');
	return setCookie.split(';', 1)[0];
}

async function postJson(app: ReturnType<typeof createServerApp>, path: string, body: unknown) {
	return app.request(`${origin}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin },
		body: JSON.stringify(body)
	});
}

test('migration chain, auth lifecycle, workspace isolation, and encrypted restore', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-foundation-'));
	const sourceUrl = `file:${join(directory, 'source.db')}`;
	const restoredUrl = `file:${join(directory, 'restored.db')}`;
	const dashboardDirectory = join(directory, 'dashboard');
	const backupPath = join(directory, 'backup.json');
	const key = Buffer.alloc(32, 7).toString('base64');
	const source = createDatabase({ url: sourceUrl });
	const sourceFinancial = createFinancialDatabase({ url: sourceUrl });
	const emails: TransactionalEmail[] = [];

	try {
		await migrate(source.db, {
			migrationsFolder: fileURLToPath(
				new URL('../../../packages/db/src/migrations', import.meta.url)
			)
		});
		await source.db.insert(user).values({
			id: 'migration-trigger-user',
			name: 'Migration Trigger',
			email: 'migration-trigger@example.com'
		});
		assert.equal(
			(
				await source.db
					.select()
					.from(workspace)
					.where(eq(workspace.personalOwnerUserId, 'migration-trigger-user'))
			).length,
			1
		);
		await source.db.delete(user).where(eq(user.id, 'migration-trigger-user'));
		await writeFile(join(directory, 'unused'), '');
		await import('node:fs/promises').then(({ mkdir }) => mkdir(dashboardDirectory));
		await writeFile(join(dashboardDirectory, 'index.html'), '<h1>Dukat dashboard</h1>');

		const auth = createAuth({
			database: source.db,
			baseURL: origin,
			secret,
			trustedOrigins: [origin],
			emailSender: {
				async send(message) {
					emails.push(message);
				}
			}
		});
		const exchangeRates = createExchangeRateRepository(sourceFinancial.db);
		const app = createServerApp({
			api: createAPI({
				auth,
				readiness: () => source.db.run('select 1'),
				ledger: createLedgerRepository(sourceFinancial.db),
				planning: createPlanningRepository(sourceFinancial.db),
				insights: createInsightsRepository(sourceFinancial.db),
				exchangeRates,
				workspaces: createWorkspaceRepository(source.db)
			}),
			dashboardDirectory
		});

		assert.equal((await app.request(`${origin}/api/health/live`)).status, 200);
		assert.equal((await app.request(`${origin}/api/health/ready`)).status, 200);
		assert.match(await (await app.request(`${origin}/dashboard`)).text(), /Dukat dashboard/);

		async function signupAndVerify(name: string, email: string, password: string) {
			const beforeEmailCount = emails.length;
			const signup = await postJson(app, '/api/auth/sign-up/email', {
				name,
				email,
				password,
				callbackURL: '/'
			});
			assert.equal(signup.status, 200, await signup.text());
			assert.equal(emails.length, beforeEmailCount + 1);
			const verificationUrl = emails.at(-1)!.text.match(/https?:\/\/\S+/)?.[0];
			assert.ok(verificationUrl);
			const verification = await app.request(verificationUrl, {
				headers: { origin }
			});
			assert.ok([200, 302].includes(verification.status));
		}

		async function signIn(email: string, password: string) {
			const response = await postJson(app, '/api/auth/sign-in/email', {
				email,
				password
			});
			assert.equal(response.status, 200, await response.text());
			return cookieFrom(response);
		}

		await signupAndVerify('First User', 'first@example.com', 'initial-password-1');
		const firstCookie = await signIn('first@example.com', 'initial-password-1');
		const firstSessionResponse = await app.request(`${origin}/api/auth/get-session`, {
			headers: { cookie: firstCookie }
		});
		assert.equal(firstSessionResponse.status, 200);
		const firstSession = (await firstSessionResponse.json()) as {
			user: { id: string };
			session: { id: string };
		};

		const firstWorkspacesResponse = await app.request(`${origin}/api/workspaces`, {
			headers: { cookie: firstCookie }
		});
		assert.equal(firstWorkspacesResponse.status, 200);
		const firstWorkspaces = (await firstWorkspacesResponse.json()) as Array<{ id: string }>;
		assert.equal(firstWorkspaces.length, 1);
		const firstWorkspaceId = firstWorkspaces[0].id;
		await exchangeRates.cacheTables([
			{
				table: 'A',
				no: '151/A/NBP/2026',
				effectiveDate: '2026-08-05',
				rates: [
					{ code: 'EUR', mid: '4.3' },
					{ code: 'USD', mid: '4' }
				]
			}
		]);
		const quote = await app.request(`${origin}/api/workspaces/${firstWorkspaceId}/rates/quote`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: firstCookie },
			body: JSON.stringify({
				fromCurrency: 'EUR',
				toCurrency: 'USD',
				date: '2026-08-05',
				amountMinor: '100'
			})
		});
		assert.equal(quote.status, 200, await quote.clone().text());
		assert.equal(
			((await quote.json()) as { suggestedAmountMinor: string }).suggestedAmountMinor,
			'108'
		);
		const manualRate = await app.request(
			`${origin}/api/workspaces/${firstWorkspaceId}/rates/manual`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: firstCookie },
				body: JSON.stringify({
					currency: 'EUR',
					rateToPln: '4.4',
					effectiveDate: '2026-08-05',
					reason: 'Foundation settlement proof'
				})
			}
		);
		assert.equal(manualRate.status, 200, await manualRate.clone().text());
		const manualQuote = await app.request(
			`${origin}/api/workspaces/${firstWorkspaceId}/rates/quote`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: firstCookie },
				body: JSON.stringify({
					fromCurrency: 'EUR',
					toCurrency: 'USD',
					date: '2026-08-05',
					amountMinor: '100'
				})
			}
		);
		const manualQuoteBody = (await manualQuote.json()) as {
			suggestedAmountMinor: string;
			rates: Array<{ currency: string; source: string }>;
		};
		assert.equal(manualQuoteBody.suggestedAmountMinor, '110');
		assert.deepEqual(
			manualQuoteBody.rates.map((rate) => [rate.currency, rate.source]),
			[
				['EUR', 'manual'],
				['USD', 'NBP']
			]
		);
		assert.equal(
			(
				await source.db
					.select()
					.from(workspace)
					.where(eq(workspace.personalOwnerUserId, firstSession.user.id))
			).length,
			1
		);
		const boundaryAccountResponse = await app.request(
			`${origin}/api/workspaces/${firstWorkspaceId}/accounts`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: firstCookie },
				body: JSON.stringify({
					name: 'Boundary account',
					type: 'cash',
					currency: 'USD',
					openingBalanceMinor: '9223372036854775807',
					idempotencyKey: 'foundation-boundary-account'
				})
			}
		);
		assert.equal(boundaryAccountResponse.status, 200);
		const boundaryAccount = (await boundaryAccountResponse.json()) as { id: string };
		const boundaryTransactionResponse = await app.request(
			`${origin}/api/workspaces/${firstWorkspaceId}/accounts/${boundaryAccount.id}/transactions`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: firstCookie },
				body: JSON.stringify({
					kind: 'expense',
					amountMinor: '9223372036854775807',
					date: '2026-07-30',
					idempotencyKey: 'foundation-boundary-transaction'
				})
			}
		);
		assert.equal(boundaryTransactionResponse.status, 200);
		assert.equal(
			((await boundaryTransactionResponse.json()) as { balanceMinor: string }).balanceMinor,
			'0'
		);

		await signupAndVerify('Second User', 'second@example.com', 'initial-password-2');
		const secondCookie = await signIn('second@example.com', 'initial-password-2');
		const secondSession = (await (
			await app.request(`${origin}/api/auth/get-session`, {
				headers: { cookie: secondCookie }
			})
		).json()) as { user: { id: string } };
		await source.db.insert(workspaceMembership).values({
			workspaceId: firstWorkspaceId,
			userId: secondSession.user.id,
			role: 'member'
		});
		const secondWorkspaces = await app.request(`${origin}/api/workspaces`, {
			headers: { cookie: secondCookie }
		});
		assert.equal(((await secondWorkspaces.json()) as Array<unknown>).length, 1);
		assert.equal(
			(
				await app.request(`${origin}/api/workspaces/${firstWorkspaceId}`, {
					headers: { cookie: secondCookie }
				})
			).status,
			404
		);

		const resetRequest = await postJson(app, '/api/auth/request-password-reset', {
			email: 'first@example.com',
			redirectTo: '/reset-password'
		});
		assert.equal(resetRequest.status, 200);
		const resetToken = emails.at(-1)!.text.match(/reset-password\/([^?\s]+)/)?.[1];
		assert.ok(resetToken);
		assert.equal(
			(
				await postJson(app, '/api/auth/reset-password', {
					token: resetToken,
					newPassword: 'replacement-password-1'
				})
			).status,
			200
		);
		const resetSession = await app.request(`${origin}/api/auth/get-session`, {
			headers: { cookie: firstCookie }
		});
		assert.equal(await resetSession.text(), 'null');
		assert.equal(
			(
				await postJson(app, '/api/auth/sign-in/email', {
					email: 'first@example.com',
					password: 'initial-password-1'
				})
			).status,
			401
		);
		const replacementCookie = await signIn('first@example.com', 'replacement-password-1');
		const replacementSession = (await (
			await app.request(`${origin}/api/auth/get-session`, {
				headers: { cookie: replacementCookie }
			})
		).json()) as { session: { id: string } };
		const productionOrigin = 'https://dukat.example';
		const productionAuth = createAuth({
			database: source.db,
			baseURL: productionOrigin,
			secret,
			trustedOrigins: [productionOrigin],
			isProduction: true,
			emailSender: { async send() {} }
		});
		const productionApp = createServerApp({
			api: createAPI({
				auth: productionAuth,
				readiness: () => source.db.run('select 1'),
				ledger: createLedgerRepository(sourceFinancial.db),
				planning: createPlanningRepository(sourceFinancial.db),
				insights: createInsightsRepository(sourceFinancial.db),
				workspaces: createWorkspaceRepository(source.db)
			}),
			dashboardDirectory
		});
		const productionSignIn = await productionApp.request(
			`${productionOrigin}/api/auth/sign-in/email`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: productionOrigin },
				body: JSON.stringify({
					email: 'first@example.com',
					password: 'replacement-password-1'
				})
			}
		);
		assert.equal(productionSignIn.status, 200);
		const productionCookie = productionSignIn.headers.get('set-cookie') ?? '';
		assert.match(productionCookie, /Secure/i);
		assert.match(productionCookie, /HttpOnly/i);
		assert.match(productionCookie, /SameSite=Lax/i);

		await source.db
			.update(session)
			.set({ expiresAt: new Date(0) })
			.where(eq(session.id, replacementSession.session.id));
		const expiredSession = await app.request(`${origin}/api/auth/get-session`, {
			headers: { cookie: replacementCookie }
		});
		assert.equal(await expiredSession.text(), 'null');

		const signOutCookie = await signIn('first@example.com', 'replacement-password-1');
		const signedOut = await app.request(`${origin}/api/auth/sign-out`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin, cookie: signOutCookie },
			body: '{}'
		});
		assert.equal(signedOut.status, 200);
		const signedOutSession = await app.request(`${origin}/api/auth/get-session`, {
			headers: { cookie: signOutCookie }
		});
		assert.equal(await signedOutSession.text(), 'null');

		await backupDatabase(sourceUrl, undefined, backupPath, key);
		await restoreDatabase(restoredUrl, undefined, backupPath, key);
		const restored = createDatabase({ url: restoredUrl });
		const restoredFinancial = createFinancialDatabase({ url: restoredUrl });
		try {
			assert.equal((await restored.db.select().from(workspace)).length, 2);
			const restoredAccounts = await createLedgerRepository(restoredFinancial.db).listAccounts({
				userId: firstSession.user.id,
				workspaceId: firstWorkspaceId
			});
			const restoredBoundary = restoredAccounts.find(
				(account) => account.id === boundaryAccount.id
			);
			assert.equal(restoredBoundary?.openingBalanceMinor, '9223372036854775807');
			assert.equal(restoredBoundary?.balanceMinor, '0');
		} finally {
			restoredFinancial.client.close();
			restored.client.close();
		}
	} finally {
		sourceFinancial.client.close();
		source.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('dashboard directory uses the server package as its development base', () => {
	assert.equal(
		resolveDashboardDirectory('../dashboard/build', { cwd: '/repo/apps/server' }),
		resolve('/repo/apps/dashboard/build')
	);
	assert.throws(
		() => resolveDashboardDirectory('../dashboard/build', { production: true }),
		/DASHBOARD_DIRECTORY must be absolute/
	);
});

test('Resend delivery uses a stable idempotency header without leaking it into the payload', async () => {
	const originalFetch = globalThis.fetch;
	let request: Request | undefined;
	globalThis.fetch = async (input, init) => {
		request = new Request(input, init);
		return new Response('{}', { status: 200 });
	};
	try {
		await createResendEmailSender('test-key', 'Dukat <test@example.com>').send({
			to: 'member@example.com',
			subject: 'Invitation',
			text: 'Join',
			idempotencyKey: 'dukat-invitation/outbox-1'
		});
		assert.equal(request?.headers.get('idempotency-key'), 'dukat-invitation/outbox-1');
		assert.deepEqual(await request?.json(), {
			from: 'Dukat <test@example.com>',
			to: 'member@example.com',
			subject: 'Invitation',
			text: 'Join'
		});
	} finally {
		globalThis.fetch = originalFetch;
	}
});
