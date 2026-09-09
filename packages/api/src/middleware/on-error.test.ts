import assert from 'node:assert/strict';
import test from 'node:test';
import { BudgetError } from '@dukat/db/repositories/budgets';
import { LedgerError } from '@dukat/db/repositories/ledger';
import { PlanningError } from '@dukat/db/repositories/planning';

import { createRouter } from '../lib/create-app';
import onError from './on-error';

for (const ErrorType of [LedgerError, PlanningError, BudgetError]) {
	test(`${ErrorType.name} codes map to expected HTTP statuses`, async () => {
		for (const [code, status] of [
			['not_found', 404],
			['conflict', 409],
			['invalid', 400]
		] as const) {
			const app = createRouter();
			app.onError(onError);
			app.get('/', () => {
				throw new ErrorType(code, code);
			});

			const response = await app.request('/');
			assert.equal(response.status, status);
			assert.deepEqual(await response.json(), { message: code });
		}
	});
}

test('production errors expose only recognized application and HTTP errors', async () => {
	const app = createRouter();
	app.onError(onError);
	app.get('/database-error', () => {
		const error = new Error('UNIQUE constraint failed: user.email') as Error & { code: string };
		error.code = 'not_found';
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
