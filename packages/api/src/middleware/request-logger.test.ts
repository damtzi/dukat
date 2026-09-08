import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';

import { createRequestLogger, sanitizeRequestPath } from './request-logger';

test('request logging removes password-reset tokens from paths', () => {
	const token = 'secret-reset-token';
	const path = sanitizeRequestPath(`/api/auth/reset-password/${token}`);

	assert.equal(path, '/api/auth/reset-password/:token');
	assert.doesNotMatch(path, new RegExp(token));
});

test('request logging removes invitation tokens and record identifiers from paths', () => {
	const token = 'private-invitation-token';
	const id = '6fe34a33-6f37-4ed9-990a-b739729506af';

	assert.equal(
		sanitizeRequestPath(`/api/workspace-invitations/${token}/accept`),
		'/api/workspace-invitations/:token/accept'
	);
	assert.equal(
		sanitizeRequestPath(`/api/workspaces/${id}/accounts/${id}/transactions`),
		'/api/workspaces/:id/accounts/:id/transactions'
	);
	assert.equal(
		sanitizeRequestPath(`/api/admin/users/${id}/disable`),
		'/api/admin/users/:userId/disable'
	);
});

test('request logging honors the configured minimum level', async () => {
	const lines: unknown[] = [];
	const original = console.info;
	console.info = (value) => lines.push(value);
	try {
		const app = new Hono();
		app.use(createRequestLogger('error'));
		app.get('/health', (context) => context.text('ok'));

		assert.equal((await app.request('/health')).status, 200);
		assert.deepEqual(lines, []);
	} finally {
		console.info = original;
	}
});
