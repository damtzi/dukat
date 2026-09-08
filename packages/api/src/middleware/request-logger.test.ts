import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';

import { createRequestLogger } from './request-logger';
import createApp from '../lib/create-app';
import type { APIServices } from '../services';

async function captureRequestLogs(app: Pick<Hono, 'request'>, request: Request | string) {
	const lines: string[] = [];
	const originalInfo = globalThis.console.info;
	const originalError = globalThis.console.error;
	globalThis.console.info = (value) => lines.push(String(value));
	globalThis.console.error = (value) => lines.push(String(value));
	try {
		const response = await app.request(request);
		return {
			response,
			logs: lines.filter((line) => line.startsWith('{')).map((line) => JSON.parse(line)) as Record<
				string,
				unknown
			>[]
		};
	} finally {
		globalThis.console.info = originalInfo;
		globalThis.console.error = originalError;
	}
}

test('request logging replaces arbitrary route parameters independent of identifier format', async () => {
	const workspaceId = 'seed-demo-workspace';
	const accountId = encodeURIComponent('ada@example.com');
	const app = new Hono();
	app.use(createRequestLogger());
	app.get('/api/workspaces/:workspaceId/accounts/:accountId/transactions', (context) =>
		context.json([])
	);

	const { logs } = await captureRequestLogs(
		app,
		`/api/workspaces/${workspaceId}/accounts/${accountId}/transactions`
	);

	assert.equal(logs.length, 2);
	for (const log of logs) {
		assert.equal(log.path, '/api/workspaces/:workspaceId/accounts/:accountId/transactions');
		assert.doesNotMatch(JSON.stringify(log), /seed-demo-workspace|ada|example/i);
	}
	assert.equal(logs[0]?.method, 'GET');
	assert.equal(logs[1]?.status, 200);
	assert.equal(typeof logs[1]?.elapsedMs, 'number');
});

test('request logging uses a fixed label for unknown paths', async () => {
	const secretPath = 'private-ada@example.com';
	const app = new Hono();
	app.use(createRequestLogger());

	const { response, logs } = await captureRequestLogs(app, `/attacker/${secretPath}`);

	assert.equal(response.status, 404);
	assert.deepEqual(
		logs.map((log) => log.path),
		['unmatched', 'unmatched']
	);
	assert.doesNotMatch(JSON.stringify(logs), new RegExp(secretPath));
});

test('request logging excludes secrets from query, body, and errors', async () => {
	const querySecret = 'query-private-value';
	const bodySecret = 'body-private-value';
	const errorSecret = 'error-private-value';
	const app = new Hono();
	app.use(createRequestLogger());
	app.post('/api/workspaces/:workspaceId/accounts', async (context) => {
		await context.req.text();
		throw new Error(errorSecret);
	});

	const { response, logs } = await captureRequestLogs(
		app,
		new Request(`http://example.test/api/workspaces/not-a-uuid/accounts?secret=${querySecret}`, {
			method: 'POST',
			body: bodySecret
		})
	);

	assert.equal(response.status, 500);
	assert.equal(logs.at(-1)?.path, '/api/workspaces/:workspaceId/accounts');
	assert.equal(logs.at(-1)?.errorName, 'Error');
	assert.doesNotMatch(
		JSON.stringify(logs),
		/query-private-value|body-private-value|error-private-value/
	);
});

test('request logging uses the registered auth wildcard for password-reset tokens', async () => {
	const token = 'secret-reset-token';
	const app = new Hono();
	app.use(createRequestLogger());
	app.on(['GET', 'POST'], '/api/auth/*', (context) => context.json({ ok: true }));

	const { response, logs } = await captureRequestLogs(
		app,
		`/api/auth/reset-password/${encodeURIComponent(token)}`
	);

	assert.equal(response.status, 200);
	assert.deepEqual(
		logs.map((log) => log.path),
		['/api/auth/*', '/api/auth/*']
	);
	assert.doesNotMatch(JSON.stringify(logs), new RegExp(token));
});

test('request logging uses the invitation route after its auth wildcard', async () => {
	const token = 'private-invitation-token';
	const app = new Hono();
	app.use(createRequestLogger());
	app.use('/api/workspace-invitations/*', async (_context, next) => next());
	app.post('/api/workspace-invitations/:token/accept', (context) => context.json({ ok: true }));

	const { response, logs } = await captureRequestLogs(
		app,
		new Request(
			`http://example.test/api/workspace-invitations/${encodeURIComponent(token)}/accept`,
			{ method: 'POST' }
		)
	);

	assert.equal(response.status, 200);
	assert.deepEqual(
		logs.map((log) => log.path),
		['/api/workspace-invitations/:token/accept', '/api/workspace-invitations/:token/accept']
	);
	assert.doesNotMatch(JSON.stringify(logs), new RegExp(token));
});

test('application logs do not trust a caller-supplied request identifier', async () => {
	const app = createApp({} as APIServices);
	app.get('/probe', (context) => context.text('ok'));
	const { logs } = await captureRequestLogs(
		app,
		new Request('http://example.test/probe', {
			headers: { 'X-Request-Id': 'private-person-name' }
		})
	);
	assert.equal(logs.length, 2);
	assert.doesNotMatch(JSON.stringify(logs), /private-person-name/);
	assert.match(String(logs[0]?.requestId), /^[0-9a-f-]{36}$/);
});

test('request logging honors the configured minimum level', async () => {
	const lines: unknown[] = [];
	const original = globalThis.console.info;
	globalThis.console.info = (value) => lines.push(value);
	try {
		const app = new Hono();
		app.use(createRequestLogger('error'));
		app.get('/health', (context) => context.text('ok'));

		assert.equal((await app.request('/health')).status, 200);
		assert.deepEqual(lines, []);
	} finally {
		globalThis.console.info = original;
	}
});
