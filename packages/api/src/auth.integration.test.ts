import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { createAuth, type Auth, type AuthEmail } from '@dukat/auth';
import {
	createDatabase,
	migrateDatabase,
	type Database,
	workspace,
	workspaceMember
} from '@dukat/db';

import { createApi } from './index';

const baseURL = 'http://localhost:3000';
let directory: string;
let app: ReturnType<typeof createApi>;
let auth: Auth;
let database: Database;
let emails: AuthEmail[];

before(async () => {
	directory = await mkdtemp(join(tmpdir(), 'dukat-auth-'));
	database = createDatabase({ url: `file:${join(directory, 'test.db')}` });
	await migrateDatabase(database);
	emails = [];
	auth = createAuth({
		database,
		baseURL,
		secret: 'test-secret-that-is-at-least-32-characters',
		environment: 'test',
		emailSender: {
			send: async (email) => {
				emails.push(email);
			}
		}
	});
	app = createApi({ auth, database });
});

after(async () => {
	await rm(directory, { recursive: true, force: true });
});

async function request(
	path: string,
	body?: unknown,
	cookie?: string,
	method = body === undefined ? 'GET' : 'POST',
	targetApp = app
) {
	return targetApp.request(`${baseURL}${path}`, {
		method,
		headers: {
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
			...(cookie ? { cookie, origin: baseURL } : {})
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

test('liveness and readiness checks are available without authentication', async () => {
	assert.deepEqual(await (await request('/health/live')).json(), { status: 'ok' });
	assert.deepEqual(await (await request('/health/ready')).json(), { status: 'ready' });
});

test('a user verifies their email, signs in, and receives exactly one personal workspace', async () => {
	const signup = await request('/api/auth/sign-up/email', {
		name: 'Ada Lovelace',
		email: 'ada@example.com',
		password: 'correct horse battery staple'
	});
	assert.equal(signup.status, 200);
	assert.equal(emails.length, 1);
	assert.equal(emails[0]?.kind, 'email-verification');

	const unverifiedSignIn = await request('/api/auth/sign-in/email', {
		email: 'ada@example.com',
		password: 'correct horse battery staple'
	});
	assert.equal(unverifiedSignIn.status, 403);

	const token = emails[0]?.token;
	assert.ok(token);
	const verification = await request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
	assert.equal(verification.status, 200);

	const signIn = await request('/api/auth/sign-in/email', {
		email: 'ada@example.com',
		password: 'correct horse battery staple'
	});
	assert.equal(signIn.status, 200);
	const cookie = signIn.headers.get('set-cookie');
	assert.ok(cookie);
	assert.match(cookie, /HttpOnly/i);
	assert.match(cookie, /SameSite=Lax/i);

	const workspaces = await request('/api/workspaces', undefined, cookie);
	assert.equal(workspaces.status, 200);
	const workspaceBody = (await workspaces.json()) as {
		workspaces: Array<{ id: string; name: string; type: string }>;
	};
	assert.equal(workspaceBody.workspaces.length, 1);
	assert.equal(workspaceBody.workspaces[0]?.name, "Ada Lovelace's workspace");
	assert.equal(workspaceBody.workspaces[0]?.type, 'personal');
});

test('a user returns with a valid session, signs out, and resets their password', async () => {
	const signIn = await request('/api/auth/sign-in/email', {
		email: 'ada@example.com',
		password: 'correct horse battery staple'
	});
	const cookie = signIn.headers.get('set-cookie');
	assert.ok(cookie);

	const session = await request('/api/auth/get-session', undefined, cookie);
	assert.equal(session.status, 200);
	assert.equal(
		((await session.json()) as { user: { email: string } }).user.email,
		'ada@example.com'
	);

	const signOut = await request('/api/auth/sign-out', {}, cookie);
	assert.equal(signOut.status, 200);
	assert.equal((await request('/api/workspaces', undefined, cookie)).status, 401);

	const emailCount = emails.length;
	const resetRequest = await request('/api/auth/request-password-reset', {
		email: 'ada@example.com',
		redirectTo: '/reset-password'
	});
	assert.equal(resetRequest.status, 200);
	assert.equal(emails.length, emailCount + 1);
	const resetEmail = emails[emails.length - 1];
	assert.equal(resetEmail?.kind, 'password-reset');
	assert.ok(resetEmail?.token);

	const reset = await request('/api/auth/reset-password', {
		newPassword: 'a newer correct horse battery staple',
		token: resetEmail.token
	});
	assert.equal(reset.status, 200);
	assert.equal(
		(
			await request('/api/auth/sign-in/email', {
				email: 'ada@example.com',
				password: 'correct horse battery staple'
			})
		).status,
		401
	);
	assert.equal(
		(
			await request('/api/auth/sign-in/email', {
				email: 'ada@example.com',
				password: 'a newer correct horse battery staple'
			})
		).status,
		200
	);
});

test('an unrelated user cannot read or change a personal workspace by identifier', async () => {
	const adaSignIn = await request('/api/auth/sign-in/email', {
		email: 'ada@example.com',
		password: 'a newer correct horse battery staple'
	});
	const adaCookie = adaSignIn.headers.get('set-cookie');
	assert.ok(adaCookie);
	const adaList = (await (await request('/api/workspaces', undefined, adaCookie)).json()) as {
		workspaces: Array<{ id: string; name: string }>;
	};
	const adaWorkspace = adaList.workspaces[0];
	assert.ok(adaWorkspace);

	const beforeSignupEmails = emails.length;
	assert.equal(
		(
			await request('/api/auth/sign-up/email', {
				name: 'Grace Hopper',
				email: 'grace@example.com',
				password: 'another correct horse battery staple'
			})
		).status,
		200
	);
	const verificationEmail = emails[beforeSignupEmails];
	assert.ok(verificationEmail);
	assert.equal(verificationEmail.kind, 'email-verification');
	assert.equal(
		(await request(`/api/auth/verify-email?token=${encodeURIComponent(verificationEmail.token)}`))
			.status,
		200
	);
	const graceSignIn = await request('/api/auth/sign-in/email', {
		email: 'grace@example.com',
		password: 'another correct horse battery staple'
	});
	const graceCookie = graceSignIn.headers.get('set-cookie');
	assert.ok(graceCookie);

	assert.equal(
		(await request(`/api/workspaces/${adaWorkspace.id}`, undefined, graceCookie)).status,
		404
	);
	assert.equal(
		(
			await request(
				`/api/workspaces/${adaWorkspace.id}`,
				{ name: 'Compromised' },
				graceCookie,
				'PATCH'
			)
		).status,
		404
	);

	const adaWorkspaceAfterAttack = (await (
		await request(`/api/workspaces/${adaWorkspace.id}`, undefined, adaCookie)
	).json()) as { workspace: { name: string } };
	assert.equal(adaWorkspaceAfterAttack.workspace.name, adaWorkspace.name);
});

test('a household member can read but only an owner can rename a household workspace', async () => {
	const adaSignIn = await request('/api/auth/sign-in/email', {
		email: 'ada@example.com',
		password: 'a newer correct horse battery staple'
	});
	const graceSignIn = await request('/api/auth/sign-in/email', {
		email: 'grace@example.com',
		password: 'another correct horse battery staple'
	});
	const adaCookie = adaSignIn.headers.get('set-cookie');
	const graceCookie = graceSignIn.headers.get('set-cookie');
	assert.ok(adaCookie);
	assert.ok(graceCookie);
	const adaId = ((await adaSignIn.json()) as { user: { id: string } }).user.id;
	const graceId = ((await graceSignIn.json()) as { user: { id: string } }).user.id;
	const householdId = 'household-workspace';
	const now = new Date().toISOString();
	await database.insert(workspace).values({
		id: householdId,
		name: 'Shared home',
		type: 'household',
		ownerUserId: null,
		createdAt: now,
		updatedAt: now
	});
	await database.insert(workspaceMember).values([
		{ workspaceId: householdId, userId: adaId, role: 'owner', createdAt: now },
		{ workspaceId: householdId, userId: graceId, role: 'member', createdAt: now }
	]);

	assert.equal(
		(await request(`/api/workspaces/${householdId}`, undefined, graceCookie)).status,
		200
	);
	assert.equal(
		(
			await request(
				`/api/workspaces/${householdId}`,
				{ name: 'Member rename' },
				graceCookie,
				'PATCH'
			)
		).status,
		403
	);
	assert.equal(
		(await request(`/api/workspaces/${householdId}`, { name: 'Owner rename' }, adaCookie, 'PATCH'))
			.status,
		200
	);
});

test('an expired session cannot access an authenticated route', async () => {
	const expiringAuth = createAuth({
		database,
		baseURL,
		secret: 'test-secret-that-is-at-least-32-characters',
		environment: 'test',
		sessionExpiresIn: 1,
		emailSender: { send: async () => undefined }
	});
	const expiringApp = createApi({ auth: expiringAuth, database });
	const signIn = await request(
		'/api/auth/sign-in/email',
		{
			email: 'ada@example.com',
			password: 'a newer correct horse battery staple'
		},
		undefined,
		'POST',
		expiringApp
	);
	const cookie = signIn.headers.get('set-cookie');
	assert.ok(cookie);
	assert.equal(
		(await request('/api/workspaces', undefined, cookie, 'GET', expiringApp)).status,
		200
	);

	await new Promise((resolve) => setTimeout(resolve, 1_100));

	assert.equal(
		(await request('/api/workspaces', undefined, cookie, 'GET', expiringApp)).status,
		401
	);
});

test('structured request logs redact auth paths and never include cookies', async () => {
	const records: Record<string, unknown>[] = [];
	const loggedApp = createApi({
		auth,
		database,
		logger: {
			info: (record) => records.push(record),
			error: (record) => records.push(record)
		}
	});
	await request(
		'/api/auth/reset-password/a-secret-reset-token?callbackURL=/',
		undefined,
		'better-auth.session_token=a-secret-cookie',
		'GET',
		loggedApp
	);
	const serialized = JSON.stringify(records);
	assert.doesNotMatch(serialized, /a-secret-reset-token/);
	assert.doesNotMatch(serialized, /a-secret-cookie/);
	assert.match(serialized, /\/api\/auth\/\*/);
});
