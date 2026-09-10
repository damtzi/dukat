import assert from 'node:assert/strict';
import test from 'node:test';
import type { Budget, BudgetReport } from '@dukat/core/budgets';
import { BudgetError, type BudgetRepository } from '@dukat/db/repositories/budgets';

import type { APIServices } from '../../services';
import { createAPI } from '../../app';

const auth = { authorization: 'Session test', 'content-type': 'application/json' };
const createdBudget = {
	id: 'created-budget',
	workspaceId: 'w',
	categoryId: 'food',
	month: '2026-08',
	amountMinor: '100',
	reportingCurrency: 'PLN',
	version: 1,
	createdAt: '2026-08-01T10:00:00.000Z',
	updatedAt: '2026-08-01T10:00:00.000Z'
} satisfies Budget;
const updatedBudget = {
	...createdBudget,
	amountMinor: '200',
	version: 2,
	updatedAt: '2026-08-02T10:00:00.000Z'
} satisfies Budget;
const report = [
	{
		...createdBudget,
		categoryName: 'Food',
		completedMinor: '40',
		expectedMinor: '60',
		remainingMinor: '60',
		forecastOverspendMinor: '0',
		missingRate: false
	}
] satisfies BudgetReport[];

const services = (reportError?: BudgetError) => {
	const calls: unknown[] = [];
	const budgets = {
		report: async (context, month, tentative) => {
			calls.push({ action: 'report', context, month, tentative });
			if (reportError) throw reportError;
			return report;
		},
		create: async (context, input) => {
			calls.push({ action: 'create', context, input });
			return createdBudget;
		},
		update: async (context, id, input) => {
			calls.push({ action: 'update', context, id, input });
			return updatedBudget;
		},
		remove: async (context, id, input) => {
			calls.push({ action: 'remove', context, id, input });
			return { removed: true as const };
		}
	} satisfies BudgetRepository;
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
		budgets,
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
	const reported = await app.request(
		'/api/workspaces/w/budgets?month=2026-08&includeTentative=true',
		{
			headers: auth
		}
	);
	assert.equal(reported.status, 200);
	assert.deepEqual(await reported.json(), report);
	const created = await app.request('/api/workspaces/w/budgets', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({
			categoryId: 'food',
			month: '2026-08',
			amountMinor: '100',
			idempotencyKey: 'create-budget'
		})
	});
	assert.equal(created.status, 200);
	assert.deepEqual(await created.json(), createdBudget);
	const updated = await app.request('/api/workspaces/w/budgets/b', {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({ amountMinor: '200', version: 1, idempotencyKey: 'update-budget' })
	});
	assert.equal(updated.status, 200);
	assert.deepEqual(await updated.json(), updatedBudget);
	const removed = await app.request('/api/workspaces/w/budgets/b', {
		method: 'DELETE',
		headers: auth,
		body: JSON.stringify({ version: 2, idempotencyKey: 'remove-budget' })
	});
	assert.equal(removed.status, 200);
	assert.deepEqual(await removed.json(), { removed: true });
	assert.deepEqual(calls, [
		{
			action: 'report',
			context: { userId: 'user', workspaceId: 'w' },
			month: '2026-08',
			tentative: true
		},
		{
			action: 'create',
			context: { userId: 'user', workspaceId: 'w' },
			input: {
				categoryId: 'food',
				month: '2026-08',
				amountMinor: '100',
				idempotencyKey: 'create-budget'
			}
		},
		{
			action: 'update',
			context: { userId: 'user', workspaceId: 'w' },
			id: 'b',
			input: { amountMinor: '200', version: 1, idempotencyKey: 'update-budget' }
		},
		{
			action: 'remove',
			context: { userId: 'user', workspaceId: 'w' },
			id: 'b',
			input: { version: 2, idempotencyKey: 'remove-budget' }
		}
	]);
});

test('budget routes map expected domain errors', async () => {
	for (const [code, status] of [
		['invalid', 400],
		['not_found', 404],
		['conflict', 409]
	] as const) {
		const message = `Budget ${code}`;
		const { configured, calls } = services(new BudgetError(code, message));
		const app = createAPI(configured);
		const response = await app.request('/api/workspaces/w/budgets?month=2026-08', {
			headers: auth
		});
		assert.equal(response.status, status);
		assert.deepEqual(await response.json(), { message });
		assert.deepEqual(calls, [
			{
				action: 'report',
				context: { userId: 'user', workspaceId: 'w' },
				month: '2026-08',
				tentative: false
			}
		]);
	}
});
