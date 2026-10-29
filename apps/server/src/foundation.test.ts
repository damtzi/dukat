import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAPI } from '@dukat/api';
import { createAuth } from '@dukat/auth/create-auth';
import { createResendEmailSender, type TransactionalEmail } from '@dukat/auth/email';
import { createDatabase } from '@dukat/db/connection';
import { backupDatabase, restoreDatabase } from '@dukat/db/recovery';
import { session, user } from '@dukat/db/schema/auth';
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

async function createFoundationFixture() {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-foundation-'));
	const sourceUrl = `file:${join(directory, 'source.db')}`;
	const dashboardDirectory = join(directory, 'dashboard');
	const source = createDatabase({ url: sourceUrl });
	const emails: TransactionalEmail[] = [];

	try {
		await migrate(source.db, {
			migrationsFolder: fileURLToPath(
				new URL('../../../packages/db/src/migrations', import.meta.url)
			)
		});
		await mkdir(join(dashboardDirectory, 'admin'), { recursive: true });
		await writeFile(join(dashboardDirectory, 'index.html'), '<h1>Dukat dashboard</h1>');
		await writeFile(
			join(dashboardDirectory, 'admin', 'index.html'),
			'<h1>Dukat administration</h1>'
		);

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
		const app = createServerApp({
			api: createAPI({ auth, readiness: () => source.db.run('select 1') }),
			dashboardDirectory
		});

		async function signup(name: string, username: string, email: string, password: string) {
			const beforeEmailCount = emails.length;
			const response = await postJson(app, '/api/auth/sign-up/email', {
				name,
				username,
				email,
				password,
				callbackURL: '/'
			});
			assert.equal(response.status, 200, await response.text());
			assert.equal(emails.length, beforeEmailCount + 1);
			return response;
		}

		async function verifyLatestEmail() {
			const verificationUrl = emails.at(-1)!.text.match(/https?:\/\/\S+/)?.[0];
			assert.ok(verificationUrl);
			const verification = await app.request(verificationUrl, { headers: { origin } });
			assert.ok([200, 302].includes(verification.status));
		}

		async function signupAndVerify(
			name: string,
			username: string,
			email: string,
			password: string
		) {
			await signup(name, username, email, password);
			await verifyLatestEmail();
		}

		async function signIn(email: string, password: string) {
			const response = await postJson(app, '/api/auth/sign-in/email', { email, password });
			assert.equal(response.status, 200, await response.text());
			return cookieFrom(response);
		}

		return {
			app,
			dashboardDirectory,
			directory,
			emails,
			signIn,
			signup,
			signupAndVerify,
			source,
			sourceUrl,
			verifyLatestEmail
		};
	} catch (error) {
		source.client.close();
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
}

type FoundationFixture = Awaited<ReturnType<typeof createFoundationFixture>>;

async function withFoundationFixture(run: (fixture: FoundationFixture) => Promise<void>) {
	const fixture = await createFoundationFixture();
	try {
		await run(fixture);
	} finally {
		fixture.source.client.close();
		await rm(fixture.directory, { recursive: true, force: true });
	}
}

async function getSession(fixture: FoundationFixture, cookie: string) {
	const response = await fixture.app.request(`${origin}/api/auth/get-session`, {
		headers: { cookie }
	});
	assert.equal(response.status, 200);
	return (await response.json()) as {
		user: { id: string; name: string; username: string; email: string; image: string | null };
		session: { id: string };
	};
}

test('migration chain creates the foundation schema and server', async () => {
	await withFoundationFixture(async ({ app, source }) => {
		await source.db.insert(user).values({
			id: 'migration-trigger-user',
			name: 'Migration Trigger',
			username: 'migration_trigger',
			email: 'migration-trigger@example.com'
		});
		await assert.rejects(
			source.db.insert(user).values({
				id: 'noncanonical-user',
				name: 'Noncanonical',
				username: 'Not_Canonical',
				email: 'noncanonical@example.com'
			})
		);
		assert.equal((await app.request(`${origin}/api/health/live`)).status, 200);
		const readyResponse = await app.request(`${origin}/api/health/ready`);
		assert.equal(readyResponse.status, 200);
		assert.equal(readyResponse.headers.get('cache-control'), 'no-store');
		const dashboardResponse = await app.request(`${origin}/dashboard`);
		assert.match(await dashboardResponse.text(), /Dukat dashboard/);
		assert.equal(dashboardResponse.headers.get('x-content-type-options'), 'nosniff');
		assert.equal(dashboardResponse.headers.get('x-frame-options'), 'SAMEORIGIN');
		assert.equal(dashboardResponse.headers.get('referrer-policy'), 'no-referrer');
		assert.match(
			dashboardResponse.headers.get('content-security-policy') ?? '',
			/frame-ancestors 'none'/
		);
		assert.equal(dashboardResponse.headers.get('strict-transport-security'), null);
		assert.match(await (await app.request(`${origin}/admin`)).text(), /Dukat administration/);
	});
});

test('authentication lifecycle validates identity and session security', async () => {
	await withFoundationFixture(async (fixture) => {
		const { app, dashboardDirectory, emails, signIn, signup, source } = fixture;
		assert.deepEqual(
			await (
				await app.request(`${origin}/api/auth/username-availability?username=%20First_User%20`)
			).json(),
			{ available: true, username: 'first_user', message: 'Username is available.' }
		);
		assert.deepEqual(
			await (await app.request(`${origin}/api/auth/username-availability?username=Support`)).json(),
			{ available: false, username: 'support', message: 'That username is reserved.' }
		);
		for (const [name, username, message] of [
			['Valid Name', 'ab', 'Username must be 3–30 characters long.'],
			['Valid Name', `a${'b'.repeat(30)}`, 'Username must be 3–30 characters long.'],
			['Valid Name', '2invalid', 'Username must start with a letter'],
			['Valid Name', '_invalid', 'Username must start with a letter'],
			['Valid Name', 'invalid-name', 'Username must start with a letter'],
			['Valid Name', 'admin', 'That username is reserved.'],
			['Valid Name', 'administrator', 'That username is reserved.'],
			['Valid Name', 'support', 'That username is reserved.'],
			['Valid Name', 'security', 'That username is reserved.'],
			['Valid Name', 'system', 'That username is reserved.'],
			['Valid Name', 'dukat', 'That username is reserved.'],
			['\u0000Invalid', 'valid_name', 'Name cannot contain control characters.'],
			['\u200eInvalid', 'valid_name', 'non-printable characters.'],
			[' '.repeat(3), 'valid_name', 'Name must be 1–100 characters long.'],
			['a'.repeat(101), 'valid_name', 'Name must be 1–100 characters long.']
		] as const) {
			const response = await postJson(app, '/api/auth/sign-up/email', {
				name,
				username,
				email: 'invalid@example.com',
				password: 'initial-password-invalid'
			});
			assert.equal(response.status, 400);
			assert.match((await response.json()).message, new RegExp(message));
		}

		await signup('  First  User!  ', ' First_User ', 'first@example.com', 'initial-password-1');
		const duplicateUsername = await postJson(app, '/api/auth/sign-up/email', {
			name: 'Other User',
			username: 'FIRST_USER',
			email: 'other@example.com',
			password: 'initial-password-other'
		});
		assert.equal(duplicateUsername.status, 409);
		assert.deepEqual(await duplicateUsername.json(), {
			code: 'USERNAME_UNAVAILABLE',
			message: 'That username is already taken.'
		});
		const [unverified] = await source.db
			.select({
				id: user.id,
				name: user.name,
				username: user.username,
				verified: user.emailVerified
			})
			.from(user)
			.where(eq(user.email, 'first@example.com'));
		assert.deepEqual(
			{ name: unverified.name, username: unverified.username, verified: unverified.verified },
			{ name: 'First  User!', username: 'first_user', verified: false }
		);
		await fixture.verifyLatestEmail();

		const raceResponses = await Promise.all([
			postJson(app, '/api/auth/sign-up/email', {
				name: 'Race One',
				username: 'race_winner',
				email: 'race-one@example.com',
				password: 'initial-password-race'
			}),
			postJson(app, '/api/auth/sign-up/email', {
				name: 'Race Two',
				username: 'RACE_WINNER',
				email: 'race-two@example.com',
				password: 'initial-password-race'
			})
		]);
		assert.deepEqual(raceResponses.map((response) => response.status).sort(), [200, 409]);
		const [raceUser] = await source.db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.username, 'race_winner'));
		const firstCookie = await signIn('first@example.com', 'initial-password-1');
		const firstSession = await getSession(fixture, firstCookie);
		assert.equal(firstSession.user.name, 'First  User!');
		assert.equal(firstSession.user.username, 'first_user');
		assert.equal(firstSession.user.email, 'first@example.com');
		assert.equal(firstSession.user.image, null);
		assert.equal(
			(
				await postJson(app, '/api/auth/sign-in/username', {
					username: 'first_user',
					password: 'initial-password-1'
				})
			).status,
			404
		);
		assert.equal(
			(
				await postJson(app, '/api/auth/update-user', {
					name: 'Unauthorized User',
					username: 'unauthorized_user'
				})
			).status,
			401
		);
		assert.equal(
			(
				await app.request(`${origin}/api/auth/update-user`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						cookie: firstCookie,
						origin: 'https://attacker.example'
					},
					body: JSON.stringify({ name: 'Cross Origin', username: 'cross_origin' })
				})
			).status,
			403
		);
		for (const [body, message] of [
			[{ name: ' ', username: 'valid_update' }, 'Name must be 1–100 characters long.'],
			[{ name: 'Valid Update', username: 'admin' }, 'That username is reserved.']
		] as const) {
			const response = await app.request(`${origin}/api/auth/update-user`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie: firstCookie, origin },
				body: JSON.stringify(body)
			});
			assert.equal(response.status, 400);
			assert.match((await response.json()).message, new RegExp(message));
		}
		const conflictUpdate = await app.request(`${origin}/api/auth/update-user`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: firstCookie, origin },
			body: JSON.stringify({ name: 'First User', username: 'RACE_WINNER' })
		});
		assert.equal(conflictUpdate.status, 409);
		assert.equal((await conflictUpdate.json()).message, 'That username is already taken.');
		await source.db.delete(user).where(eq(user.id, raceUser.id));

		const profileUpdate = await app.request(`${origin}/api/auth/update-user`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie: firstCookie, origin },
			body: JSON.stringify({ name: '  Updated  User  ', username: ' Updated_User ' })
		});
		assert.equal(profileUpdate.status, 200, await profileUpdate.clone().text());
		const refreshedIdentity = await getSession(fixture, firstCookie);
		assert.deepEqual(refreshedIdentity.user, {
			...refreshedIdentity.user,
			name: 'Updated  User',
			username: 'updated_user',
			email: 'first@example.com',
			image: null
		});
		assert.equal(
			(
				(await (
					await app.request(`${origin}/api/auth/username-availability?username=updated_user`, {
						headers: { cookie: firstCookie }
					})
				).json()) as { available: boolean }
			).available,
			true
		);
		assert.equal(
			(
				(await (
					await app.request(`${origin}/api/auth/username-availability?username=first_user`)
				).json()) as { available: boolean }
			).available,
			true
		);
		await signup('Username Reuser', 'first_user', 'reuser@example.com', 'initial-password-reuser');
		const [reuser] = await source.db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, 'reuser@example.com'));
		assert.ok(reuser);
		await source.db.delete(user).where(eq(user.id, reuser.id));

		assert.equal(
			(
				await postJson(app, '/api/auth/request-password-reset', {
					email: 'first@example.com',
					redirectTo: '/reset-password'
				})
			).status,
			200
		);
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
		assert.equal(
			await (
				await app.request(`${origin}/api/auth/get-session`, { headers: { cookie: firstCookie } })
			).text(),
			'null'
		);
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
		const replacementSession = await getSession(fixture, replacementCookie);

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
			api: createAPI({ auth: productionAuth, readiness: () => source.db.run('select 1') }),
			dashboardDirectory,
			isProduction: true
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
		assert.match(productionSignIn.headers.get('strict-transport-security') ?? '', /max-age=/);
		const productionSessionCookie = cookieFrom(productionSignIn);
		const updateRateResponses: number[] = [];
		for (let attempt = 0; attempt < 12; attempt += 1) {
			updateRateResponses.push(
				(
					await productionApp.request(`${productionOrigin}/api/auth/update-user`, {
						method: 'POST',
						headers: {
							'content-type': 'application/json',
							cookie: productionSessionCookie,
							origin: productionOrigin
						},
						body: '{}'
					})
				).status
			);
		}
		assert.ok(updateRateResponses.includes(429));
		assert.ok(updateRateResponses.includes(400));
		const availabilityRateResponses: number[] = [];
		for (let attempt = 0; attempt < 31; attempt += 1) {
			availabilityRateResponses.push(
				(
					await productionApp.request(
						`${productionOrigin}/api/auth/username-availability?username=rate_limit_candidate`
					)
				).status
			);
		}
		assert.ok(availabilityRateResponses.includes(200));
		assert.ok(availabilityRateResponses.includes(429));

		await source.db
			.update(session)
			.set({ expiresAt: new Date(0) })
			.where(eq(session.id, replacementSession.session.id));
		assert.equal(
			await (
				await app.request(`${origin}/api/auth/get-session`, {
					headers: { cookie: replacementCookie }
				})
			).text(),
			'null'
		);
		const signOutCookie = await signIn('first@example.com', 'replacement-password-1');
		assert.equal(
			(
				await app.request(`${origin}/api/auth/sign-out`, {
					method: 'POST',
					headers: { origin, cookie: signOutCookie }
				})
			).status,
			200
		);
		assert.equal(
			await (
				await app.request(`${origin}/api/auth/get-session`, {
					headers: { cookie: signOutCookie }
				})
			).text(),
			'null'
		);
	});
});

test('encrypted recovery restores the database', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify(
			'Recovery User',
			'recovery_user',
			'recovery@example.com',
			'recovery-password'
		);

		const backupPath = join(fixture.directory, 'backup.json');
		const restoredUrl = `file:${join(fixture.directory, 'restored.db')}`;
		const key = Buffer.alloc(32, 7).toString('base64');
		await backupDatabase(fixture.sourceUrl, undefined, backupPath, key);
		await restoreDatabase(restoredUrl, undefined, backupPath, key);
		const restored = createDatabase({ url: restoredUrl });
		try {
			const [restoredUser] = await restored.db
				.select({ username: user.username, emailVerified: user.emailVerified })
				.from(user)
				.where(eq(user.email, 'recovery@example.com'));
			assert.deepEqual(restoredUser, { username: 'recovery_user', emailVerified: true });
		} finally {
			restored.client.close();
		}
	});
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
