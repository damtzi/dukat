import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAPI, createProfileImageService } from '@dukat/api';
import { createAuth } from '@dukat/auth/create-auth';
import { createResendEmailSender, type TransactionalEmail } from '@dukat/auth/email';
import { createDatabase, createFinancialDatabase } from '@dukat/db/connection';
import { createAdministrationRepository } from '@dukat/db/repositories/administration';
import { createExchangeRateRepository } from '@dukat/db/repositories/exchange-rates';
import { createFavoriteRepository } from '@dukat/db/repositories/favorites';
import { createInsightsRepository } from '@dukat/db/repositories/insights';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { createPlanningRepository } from '@dukat/db/repositories/planning';
import { createProfileImageCleanupRepository } from '@dukat/db/repositories/profile-image-cleanup';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { backupDatabase, restoreDatabase } from '@dukat/db/recovery';
import { profileImageCleanupJob, session, user } from '@dukat/db/schema/auth';
import { workspace, workspaceMembership } from '@dukat/db/schema/workspaces';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import sharp from 'sharp';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';
import { createProfileImageCleanup } from './profile-image-cleanup';
import { normalizeProfileImage } from './profile-image-normalizer';
import { createLocalProfileImageStorage } from './profile-image-storage';

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
	const profileImagesDirectory = join(directory, 'profile-images');
	const source = createDatabase({ url: sourceUrl });
	const sourceFinancial = createFinancialDatabase({ url: sourceUrl });
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

		const administration = createAdministrationRepository(source.db);
		const auth = createAuth({
			database: source.db,
			baseURL: origin,
			secret,
			trustedOrigins: [origin],
			registrationOpen: administration.registrationOpen,
			emailSender: {
				async send(message) {
					emails.push(message);
				}
			}
		});
		const exchangeRates = createExchangeRateRepository(sourceFinancial.db);
		const profileImageStorage = createLocalProfileImageStorage(profileImagesDirectory);
		const profileImageCleanup = createProfileImageCleanup({
			repository: createProfileImageCleanupRepository(source.db),
			storage: profileImageStorage
		});
		const app = createServerApp({
			api: createAPI({
				administration,
				auth,
				favorites: createFavoriteRepository(source.db),
				profileImageCleanup,
				profileImages: createProfileImageService({
					auth,
					storage: profileImageStorage,
					cleanup: profileImageCleanup,
					normalize: normalizeProfileImage
				}),
				readiness: () => source.db.run('select 1'),
				ledger: createLedgerRepository(sourceFinancial.db),
				planning: createPlanningRepository(sourceFinancial.db),
				insights: createInsightsRepository(sourceFinancial.db),
				exchangeRates,
				workspaces: createWorkspaceRepository(source.db)
			}),
			dashboardDirectory,
			profileImagesDirectory
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
			administration,
			app,
			dashboardDirectory,
			directory,
			emails,
			exchangeRates,
			profileImageCleanup,
			signIn,
			signup,
			signupAndVerify,
			source,
			sourceFinancial,
			sourceUrl,
			verifyLatestEmail
		};
	} catch (error) {
		sourceFinancial.client.close();
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
		fixture.sourceFinancial.client.close();
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

async function getOnlyWorkspaceId(fixture: FoundationFixture, cookie: string) {
	const response = await fixture.app.request(`${origin}/api/workspaces`, {
		headers: { cookie }
	});
	assert.equal(response.status, 200);
	const workspaces = (await response.json()) as Array<{ id: string }>;
	assert.equal(workspaces.length, 1);
	return workspaces[0].id;
}

test('migration chain creates the foundation schema and server', async () => {
	await withFoundationFixture(async ({ app, source }) => {
		const userColumns = await source.client.execute('PRAGMA table_info(user)');
		const usernameColumn = userColumns.rows.find((column) => column.name === 'username');
		assert.equal(usernameColumn?.notnull, 1);
		const userIndexes = await source.client.execute('PRAGMA index_list(user)');
		assert.equal(
			userIndexes.rows.some(
				(index) => index.name === 'user_username_unique' && Number(index.unique) === 1
			),
			true
		);
		const userTriggers = await source.client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'user'"
		);
		assert.deepEqual(userTriggers.rows.map((trigger) => trigger.name).sort(), [
			'user_create_personal_workspace',
			'user_household_sole_owner_guard',
			'user_only_member_household_cleanup',
			'user_profile_image_delete_cleanup',
			'user_profile_image_update_cleanup'
		]);
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
		assert.equal(
			(
				await source.db
					.select()
					.from(workspace)
					.where(eq(workspace.personalOwnerUserId, 'migration-trigger-user'))
			).length,
			1
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
		const { administration, app, dashboardDirectory, emails, signIn, signup, source } = fixture;
		await administration.setRegistrationOpen(false);
		assert.equal(
			(
				await postJson(app, '/api/auth/sign-up/email', {
					name: 'Closed User',
					username: 'closed_user',
					email: 'closed@example.com',
					password: 'initial-password-closed'
				})
			).status,
			403
		);
		await administration.setRegistrationOpen(true);

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
		assert.equal(
			(
				await source.db
					.select()
					.from(workspace)
					.where(eq(workspace.personalOwnerUserId, unverified.id))
			).length,
			1
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
		assert.equal(
			(
				await source.db
					.select()
					.from(workspace)
					.where(eq(workspace.personalOwnerUserId, raceUser.id))
			).length,
			1
		);

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
		assert.equal(
			(
				await app.request(`${origin}/api/auth/update-user`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', cookie: firstCookie, origin },
					body: JSON.stringify({ image: '/profile-images/users/another-user/image.webp' })
				})
			).status,
			400
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
			api: createAPI({
				auth: productionAuth,
				favorites: createFavoriteRepository(source.db),
				readiness: () => source.db.run('select 1'),
				ledger: createLedgerRepository(fixture.sourceFinancial.db),
				planning: createPlanningRepository(fixture.sourceFinancial.db),
				insights: createInsightsRepository(fixture.sourceFinancial.db),
				workspaces: createWorkspaceRepository(source.db)
			}),
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
		const disabledCookie = await signIn('first@example.com', 'replacement-password-1');
		await administration.setUserDisabled(firstSession.user.id, true);
		assert.equal(
			(await app.request(`${origin}/api/workspaces`, { headers: { cookie: disabledCookie } }))
				.status,
			401
		);
		assert.equal(
			(
				await postJson(app, '/api/auth/sign-in/email', {
					email: 'first@example.com',
					password: 'replacement-password-1'
				})
			).status,
			403
		);
	});
});

test('profile images upload, serve, and delete independently', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify(
			'Image User',
			'image_user',
			'image@example.com',
			'image-password'
		);
		const cookie = await fixture.signIn('image@example.com', 'image-password');
		const genericImageUpdate = await fixture.app.request(`${origin}/api/auth/update-user`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, origin },
			body: JSON.stringify({ image: '/profile-images/users/another-user/image.webp' })
		});
		assert.equal(genericImageUpdate.status, 400);

		const source = await sharp({
			create: { width: 2, height: 2, channels: 3, background: 'red' }
		})
			.png()
			.toBuffer();
		const bytes = source.buffer.slice(
			source.byteOffset,
			source.byteOffset + source.byteLength
		) as ArrayBuffer;
		const form = new FormData();
		form.set('image', new File([bytes], 'profile.png', { type: 'image/png' }));
		form.set('x', '0.5');
		form.set('y', '0.5');
		form.set('zoom', '1');
		const upload = await fixture.app.request(`${origin}/api/profile/image`, {
			method: 'POST',
			headers: { cookie, origin },
			body: form
		});
		assert.equal(upload.status, 200, await upload.clone().text());
		const imageUrl = ((await upload.json()) as { image: string }).image;
		assert.equal((await getSession(fixture, cookie)).user.image, imageUrl);
		assert.equal((await fixture.app.request(`${origin}${imageUrl}`)).status, 200);
		assert.equal(
			(
				await fixture.app.request(`${origin}/api/profile/image`, {
					method: 'DELETE',
					headers: { cookie, origin }
				})
			).status,
			204
		);
		assert.equal((await getSession(fixture, cookie)).user.image, null);
	});
});

test('exchange rates prefer workspace manual rates over NBP rates', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify('Rate User', 'rate_user', 'rate@example.com', 'rate-password');
		const cookie = await fixture.signIn('rate@example.com', 'rate-password');
		const workspaceId = await getOnlyWorkspaceId(fixture, cookie);
		await fixture.exchangeRates.cacheTables([
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
		const quote = await fixture.app.request(`${origin}/api/workspaces/${workspaceId}/rates/quote`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie },
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

		const manualRate = await fixture.app.request(
			`${origin}/api/workspaces/${workspaceId}/rates/manual`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({
					currency: 'EUR',
					rateToPln: '4.4',
					effectiveDate: '2026-08-05',
					reason: 'Foundation settlement proof'
				})
			}
		);
		assert.equal(manualRate.status, 200, await manualRate.clone().text());
		const manualQuote = await fixture.app.request(
			`${origin}/api/workspaces/${workspaceId}/rates/quote`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({
					fromCurrency: 'EUR',
					toCurrency: 'USD',
					date: '2026-08-05',
					amountMinor: '100'
				})
			}
		);
		const body = (await manualQuote.json()) as {
			suggestedAmountMinor: string;
			rates: Array<{ currency: string; source: string }>;
		};
		assert.equal(body.suggestedAmountMinor, '110');
		assert.deepEqual(
			body.rates.map((rate) => [rate.currency, rate.source]),
			[
				['EUR', 'manual'],
				['USD', 'NBP']
			]
		);
	});
});

test('workspace authorization isolates personal workspaces', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify('First User', 'first_user', 'first@example.com', 'password-1');
		const firstCookie = await fixture.signIn('first@example.com', 'password-1');
		const firstWorkspaceId = await getOnlyWorkspaceId(fixture, firstCookie);
		await fixture.signupAndVerify('Second User', 'second_user', 'second@example.com', 'password-2');
		const secondCookie = await fixture.signIn('second@example.com', 'password-2');
		const secondSession = await getSession(fixture, secondCookie);
		await fixture.source.db.insert(workspaceMembership).values({
			workspaceId: firstWorkspaceId,
			userId: secondSession.user.id,
			role: 'member'
		});
		assert.equal(
			(
				(await (
					await fixture.app.request(`${origin}/api/workspaces`, {
						headers: { cookie: secondCookie }
					})
				).json()) as Array<unknown>
			).length,
			1
		);
		assert.equal(
			(
				await fixture.app.request(`${origin}/api/workspaces/${firstWorkspaceId}`, {
					headers: { cookie: secondCookie }
				})
			).status,
			404
		);
	});
});

test('account deletion blocks access until administration restores the account', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify(
			'Deletion User',
			'deletion_user',
			'deletion@example.com',
			'deletion-password'
		);
		const cookie = await fixture.signIn('deletion@example.com', 'deletion-password');
		const identity = await getSession(fixture, cookie);
		const deletion = await fixture.app.request(`${origin}/api/account/delete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', cookie, origin },
			body: JSON.stringify({ password: 'deletion-password', confirmation: 'DELETE' })
		});
		assert.equal(deletion.status, 200, await deletion.clone().text());
		assert.equal(
			(await fixture.app.request(`${origin}/api/workspaces`, { headers: { cookie } })).status,
			401
		);
		assert.equal(
			(
				await postJson(fixture.app, '/api/auth/sign-in/email', {
					email: 'deletion@example.com',
					password: 'deletion-password'
				})
			).status,
			403
		);
		await fixture.administration.restoreAccount(identity.user.id);
		await fixture.signIn('deletion@example.com', 'deletion-password');
	});
});

test('encrypted recovery preserves integer precision and cleanup jobs', async () => {
	await withFoundationFixture(async (fixture) => {
		await fixture.signupAndVerify(
			'Recovery User',
			'recovery_user',
			'recovery@example.com',
			'recovery-password'
		);
		const cookie = await fixture.signIn('recovery@example.com', 'recovery-password');
		const identity = await getSession(fixture, cookie);
		const workspaceId = await getOnlyWorkspaceId(fixture, cookie);
		const accountResponse = await fixture.app.request(
			`${origin}/api/workspaces/${workspaceId}/accounts`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({
					name: 'Boundary account',
					type: 'cash',
					currency: 'USD',
					openingDate: '2026-07-30',
					openingBalanceMinor: '9223372036854775807',
					idempotencyKey: 'foundation-boundary-account'
				})
			}
		);
		assert.equal(accountResponse.status, 200);
		const account = (await accountResponse.json()) as { id: string };
		const transactionResponse = await fixture.app.request(
			`${origin}/api/workspaces/${workspaceId}/accounts/${account.id}/transactions`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', cookie },
				body: JSON.stringify({
					kind: 'expense',
					amountMinor: '9223372036854775807',
					date: '2026-07-31',
					idempotencyKey: 'foundation-boundary-transaction'
				})
			}
		);
		assert.equal(transactionResponse.status, 200);
		assert.equal(
			((await transactionResponse.json()) as { balanceMinor: string }).balanceMinor,
			'0'
		);
		await fixture.profileImageCleanup.enqueue(
			identity.user.id,
			'/profile-images/users/recovery/pending.webp'
		);

		const backupPath = join(fixture.directory, 'backup.json');
		const restoredUrl = `file:${join(fixture.directory, 'restored.db')}`;
		const key = Buffer.alloc(32, 7).toString('base64');
		await backupDatabase(fixture.sourceUrl, undefined, backupPath, key);
		await restoreDatabase(restoredUrl, undefined, backupPath, key);
		const restored = createDatabase({ url: restoredUrl });
		const restoredFinancial = createFinancialDatabase({ url: restoredUrl });
		try {
			assert.equal((await restored.db.select().from(workspace)).length, 1);
			assert.deepEqual(
				(await restored.db.select().from(profileImageCleanupJob)).map((job) => job.publicUrl),
				['/profile-images/users/recovery/pending.webp']
			);
			const restoredAccounts = await createLedgerRepository(restoredFinancial.db).listAccounts({
				userId: identity.user.id,
				workspaceId
			});
			const restoredBoundary = restoredAccounts.find((item) => item.id === account.id);
			assert.equal(restoredBoundary?.openingBalanceMinor, '9223372036854775807');
			assert.equal(restoredBoundary?.balanceMinor, '0');
		} finally {
			restoredFinancial.client.close();
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
