import assert from 'node:assert/strict';
import test from 'node:test';

import type { APIServices } from '../../services';
import { createAPI } from '../../app';

function services(): APIServices {
	return {
		auth: {
			handler: async () => new Response(null, { status: 404 }),
			usernameAvailability: async (username) => ({
				available: true,
				username,
				message: 'Available'
			}),
			api: {
				getSession: async ({ headers }) =>
					headers.get('authorization') === 'Session test'
						? {
								user: {
									id: 'user',
									name: 'User',
									username: 'user',
									email: 'u@test',
									emailVerified: true
								}
							}
						: null,
				verifyPassword: async () => undefined
			}
		},
		exports: {
			async *completeJson(userId: string) {
				yield '{"version":';
				yield userId === 'user' ? '1}' : '0}';
			},
			async *csv(userId: string, name: string) {
				yield 'contract_version,user_id,name\r\n';
				yield `1,${userId},${name}\r\n`;
			}
		} as APIServices['exports'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {} as APIServices['workspaces'],
		readiness: async () => undefined
	};
}

test('export downloads require authentication and stream versioned files', async () => {
	const app = createAPI(services());
	assert.equal((await app.request('/api/exports/complete.json')).status, 401);

	const json = await app.request('/api/exports/complete.json', {
		headers: { authorization: 'Session test' }
	});
	assert.equal(json.status, 200);
	assert.equal(json.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.match(
		json.headers.get('content-disposition') ?? '',
		/attachment; filename="dukat-complete-/
	);
	assert.equal(json.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await json.json(), { version: 1 });

	const csv = await app.request('/api/exports/transactions.csv', {
		headers: { authorization: 'Session test' }
	});
	assert.equal(csv.status, 200);
	assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
	assert.match(await csv.text(), /1,user,transactions/);
	assert.equal(
		(
			await app.request('/api/exports/unknown.csv', {
				headers: { authorization: 'Session test' }
			})
		).status,
		404
	);
});
