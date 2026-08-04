import assert from 'node:assert/strict';
import test from 'node:test';

import { createRouter } from '../lib/create-app';
import onError from './on-error';

test('production errors expose only recognized application and HTTP errors', async () => {
	const app = createRouter();
	app.onError(onError);
	app.get('/database-error', () => {
		const error = new Error('UNIQUE constraint failed: user.email') as Error & { code: string };
		error.code = 'SQLITE_CONSTRAINT_UNIQUE';
		throw error;
	});

	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		const response = await app.request('/database-error');
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { message: 'Internal Server Error' });
	} finally {
		if (previous === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previous;
	}
});
