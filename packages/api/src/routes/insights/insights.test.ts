import assert from 'node:assert/strict';
import test from 'node:test';
import type { APIServices } from '../../services';
import { createAPI } from '../../app';

const services = (): APIServices => ({
	auth: {
		handler: async () => new Response(null, { status: 404 }),
		api: {
			getSession: async ({ headers }) =>
				headers.get('authorization') === 'Session test'
					? { user: { id: 'user', email: 'u@test', emailVerified: true } }
					: null,
			async verifyPassword() {}
		}
	},
	async readiness() {},
	favorites: {} as APIServices['favorites'],
	ledger: {} as APIServices['ledger'],
	planning: {} as APIServices['planning'],
	insights: {
		listCategories: async () => [],
		summary: async () => ({ currencies: [] }),
		preview: async () => ({ rows: [] }),
		confirm: async () => ({})
	} as unknown as APIServices['insights'],
	workspaces: {} as APIServices['workspaces']
});
const auth = { authorization: 'Session test', 'content-type': 'application/json' };

test('insights routes require authentication and reject malformed categories, summary, preview and confirm', async () => {
	const app = createAPI(services());
	assert.equal((await app.request('/api/workspaces/w/categories')).status, 401);
	assert.equal(
		(
			await app.request('/api/workspaces/w/categories', {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ name: ' ' })
			})
		).status,
		400
	);
	assert.equal(
		(
			await app.request('/api/workspaces/w/summary?startDate=2026-08-02&endDate=2026-08-01', {
				headers: auth
			})
		).status,
		400
	);
	assert.equal(
		(
			await app.request('/api/workspaces/w/imports/preview', {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ filename: '../bad.csv', accountId: 'a', csv: 'x' })
			})
		).status,
		400
	);
	assert.equal(
		(
			await app.request('/api/workspaces/w/imports/confirm', {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ filename: 'ok.csv', accountId: 'a', csv: 'x', rows: [] })
			})
		).status,
		400
	);
});

test('category writes require and forward version and idempotency bodies', async () => {
	const received: unknown[] = [];
	const configured = services();
	configured.insights = {
		createCategory: async (_context: unknown, input: Record<string, unknown>) => {
			received.push(input);
			return {};
		},
		updateCategory: async (_context: unknown, id: string, input: Record<string, unknown>) => {
			received.push({ id, ...input });
			return {};
		},
		categoryAction: async (
			_context: unknown,
			id: string,
			action: 'delete' | 'archive' | 'restore',
			input: Record<string, unknown>
		) => {
			received.push({ id, action, ...input });
			return { id, action };
		}
	} as unknown as APIServices['insights'];
	const app = createAPI(configured);
	assert.equal(
		(
			await app.request('/api/workspaces/w/categories', {
				method: 'POST',
				headers: auth,
				body: JSON.stringify({ name: 'Food' })
			})
		).status,
		400
	);
	await app.request('/api/workspaces/w/categories', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ name: 'Food', idempotencyKey: 'create-key' })
	});
	await app.request('/api/workspaces/w/categories/c', {
		method: 'PUT',
		headers: auth,
		body: JSON.stringify({ name: 'Dining', version: 2, idempotencyKey: 'rename-key' })
	});
	assert.equal(
		(await app.request('/api/workspaces/w/categories/c/archive', { method: 'POST', headers: auth }))
			.status,
		400
	);
	await app.request('/api/workspaces/w/categories/c/archive', {
		method: 'POST',
		headers: auth,
		body: JSON.stringify({ version: 3, idempotencyKey: 'archive-key' })
	});
	assert.deepEqual(received, [
		{ name: 'Food', idempotencyKey: 'create-key' },
		{ id: 'c', name: 'Dining', version: 2, idempotencyKey: 'rename-key' },
		{ id: 'c', action: 'archive', version: 3, idempotencyKey: 'archive-key' }
	]);
});
