import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeRequestPath } from './request-logger';

test('request logging removes password-reset tokens from paths', () => {
	const token = 'secret-reset-token';
	const path = sanitizeRequestPath(`/api/auth/reset-password/${token}`);

	assert.equal(path, '/api/auth/reset-password/:token');
	assert.doesNotMatch(path, new RegExp(token));
});
