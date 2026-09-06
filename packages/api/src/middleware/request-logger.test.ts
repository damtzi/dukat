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
