import assert from 'node:assert/strict';
import test from 'node:test';

import { testClient } from 'hono/testing';
import { createAPI } from '../../app';
import type { APIServices, FavoriteService } from '../../services';

const headers = { authorization: 'Session test' };

function createServices(favorites: FavoriteService): APIServices {
	return {
		auth: {
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
			async handler() {
				return new Response(null, { status: 404 });
			},
			api: {
				async getSession({ headers: requestHeaders }) {
					return requestHeaders.get('authorization') === 'Session test'
						? { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } }
						: null;
				},
				async verifyPassword() {}
			}
		},
		favorites,
		async readiness() {},
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {} as APIServices['workspaces']
	};
}

test('favorite routes require a session and use the authenticated user', async () => {
	let removed: [string, string] | undefined;
	const favorite = {
		id: 'favorite-1',
		path: '/workspaces/workspace-1/rates',
		label: 'Home · Exchange rates'
	};
	const favorites: FavoriteService = {
		async list(userId) {
			assert.equal(userId, 'user-1');
			return [favorite];
		},
		async add(userId, input) {
			assert.equal(userId, 'user-1');
			return { id: 'favorite-2', ...input };
		},
		async remove(userId, favoriteId) {
			removed = [userId, favoriteId];
		}
	};
	const api = createAPI(createServices(favorites));
	assert.equal((await api.request('/api/favorites')).status, 401);

	const client = testClient(api);
	const listed = await client.api.favorites.$get({}, { headers });
	assert.deepEqual(await listed.json(), [favorite]);
	const created = await client.api.favorites.$post(
		{ json: { path: '/workspaces/workspace-1/categories', label: 'Home · Categories' } },
		{ headers }
	);
	assert.equal(created.status, 201);
	assert.deepEqual(await created.json(), {
		id: 'favorite-2',
		path: '/workspaces/workspace-1/categories',
		label: 'Home · Categories'
	});
	const deleted = await client.api.favorites[':favoriteId'].$delete(
		{ param: { favoriteId: favorite.id } },
		{ headers }
	);
	assert.equal(deleted.status, 204);
	assert.deepEqual(removed, ['user-1', favorite.id]);

	assert.equal(
		(
			await api.request('/api/favorites', {
				method: 'POST',
				headers: { ...headers, 'content-type': 'application/json' },
				body: JSON.stringify({ path: '//external.example', label: 'Unsafe' })
			})
		).status,
		400
	);
});
