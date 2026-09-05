import assert from 'node:assert/strict';
import test from 'node:test';

import type { APIServices } from '../../services';
import { createAPI } from '../../app';

const auth = { authorization: 'Session test', 'content-type': 'application/json' };
const services = () => {
	const calls: unknown[] = [];
	const configured = {
		auth: {
			handler: async () => new Response(null, { status: 404 }),
			usernameAvailability: async (username: string) => ({
				available: true,
				username,
				message: 'Available'
			}),
			api: {
				getSession: async ({ headers }: { headers: Headers }) =>
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
		budgets: {
			report: async (_context: unknown, month: string, tentative: boolean) => {
				calls.push({ action: 'report', month, tentative });
				return [];
			},
			create: async (_context: unknown, input: unknown) => {
				calls.push({ action: 'create', input });
				return {};
			},
			update: async (_context: unknown, id: string, input: unknown) => {
				calls.push({ action: 'update', id, input });
				return {};
			},
			remove: async (_context: unknown, id: string, input: unknown) => {
				calls.push({ action: 'remove', id, input });
				return { removed: true };
			}
		},
		favorites: {},
		ledger: {},
		planning: {},
		insights: {},
		workspaces: {},
		readiness: async () => undefined
	} as unknown as APIServices;
	return { configured, calls };
};

test('budget routes validate and forward report and mutation inputs', async () => {
	const { configured, calls } = services();
	const app = createAPI(configured);
	assert.equal((await app.request('/api/workspaces/w/budgets?month=2026-08')).status, 401);
	assert.equal(
		(await app.request('/api/workspaces/w/budgets?month=2026-13', { headers: auth })).status,
		400
	);
	assert.equal(
		(
			await app.request('/api/workspaces/w/budgets', {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ categoryId: 'food', month: '2026-08', amountMinor: '100' })
			})
		).status,
		400
	);
	await app.request('/api/workspaces/w/budgets?month=2026-08&includeTentative=true', {
		headers: auth
	});
	await app.request('/api/workspaces/w/budgets', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			categoryId: 'food',
			month: '2026-08',
			amountMinor: '100',
			idempotencyKey: 'create-budget'
		})
	});
	await app.request('/api/workspaces/w/budgets/b', {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({ amountMinor: '200', version: 1, idempotencyKey: 'update-budget' })
	});
	await app.request('/api/workspaces/w/budgets/b', {
		method: 'DELETE',
		headers: auth,
		body: JSON.stringify({ version: 2, idempotencyKey: 'remove-budget' })
	});
	assert.deepEqual(calls, [
		{ action: 'report', month: '2026-08', tentative: true },
		{
			action: 'create',
			input: {
				categoryId: 'food',
				month: '2026-08',
				amountMinor: '100',
				idempotencyKey: 'create-budget'
			}
		},
		{
			action: 'update',
			id: 'b',
			input: { amountMinor: '200', version: 1, idempotencyKey: 'update-budget' }
		},
		{
			action: 'remove',
			id: 'b',
			input: { version: 2, idempotencyKey: 'remove-budget' }
		}
	]);
});
