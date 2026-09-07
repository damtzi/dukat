import assert from 'node:assert/strict';
import test from 'node:test';

import { createAPI } from '../../app';
import type { APIServices } from '../../services';

function services(): APIServices {
	let registrationOpen = true;
	return {
		auth: {
			async handler() {
				return new Response(null, { status: 404 });
			},
			async usernameAvailability(username) {
				return { available: true, username, message: 'Available' };
			},
			async accessStatus(userId) {
				return { isAdmin: userId === 'admin', disabledAt: null, deletionRequestedAt: null };
			},
			api: {
				async getSession({ headers }) {
					const id = headers.get('authorization')?.replace('Session ', '');
					return id
						? {
								user: {
									id,
									name: id,
									username: `${id}_user`,
									email: `${id}@example.com`,
									emailVerified: true,
									image: null
								}
							}
						: null;
				},
				async verifyPassword() {}
			}
		},
		administration: {
			async registrationOpen() {
				return registrationOpen;
			},
			async setRegistrationOpen(open) {
				registrationOpen = open;
				return { registrationOpen };
			},
			async listUsers() {
				return [{ id: 'user', name: 'User', email: 'user@example.com', disabledAt: null }];
			},
			async setUserDisabled(userId, disabled) {
				return { id: userId, disabledAt: disabled ? new Date() : null };
			},
			async restoreAccount(userId) {
				return { id: userId, deletionRequestedAt: null };
			},
			async purgeExpiredAccounts() {
				return [];
			}
		},
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {} as APIServices['workspaces']
	};
}

test('administration routes require an administrator and expose operational data only', async () => {
	const app = createAPI(services());
	assert.equal((await app.request('/api/admin/state')).status, 401);
	assert.equal(
		(await app.request('/api/admin/state', { headers: { authorization: 'Session user' } })).status,
		403
	);

	const headers = { authorization: 'Session admin' };
	const response = await app.request('/api/admin/state', { headers });
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.deepEqual(body, {
		registrationOpen: true,
		users: [{ id: 'user', name: 'User', email: 'user@example.com', disabledAt: null }]
	});
	assert.ok(!JSON.stringify(body).match(/balance|transaction|workspace/i));

	const closed = await app.request('/api/admin/registration', {
		method: 'PATCH',
		headers: { ...headers, 'content-type': 'application/json' },
		body: JSON.stringify({ registrationOpen: false })
	});
	assert.deepEqual(await closed.json(), { registrationOpen: false });
	assert.equal((await app.request('/api/service/registration')).status, 200);
	assert.deepEqual(await (await app.request('/api/service/registration')).json(), {
		registrationOpen: false
	});
	assert.equal(
		(await app.request('/api/admin/users/user/disable', { method: 'POST', headers })).status,
		200
	);
});
