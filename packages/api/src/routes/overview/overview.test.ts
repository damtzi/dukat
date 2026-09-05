import assert from 'node:assert/strict';
import test from 'node:test';

import { createAPI } from '../../app';
import type { APIServices } from '../../services';

const requestedUsers: string[] = [];

function services(): APIServices {
	return {
		auth: {
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
			handler: async () => new Response(null, { status: 404 }),
			api: {
				getSession: async ({ headers }) => {
					const userId = headers.get('authorization')?.replace('Session ', '');
					return userId
						? {
								user: {
									id: userId,
									name: userId,
									username: userId,
									email: `${userId}@test`,
									emailVerified: true,
									image: null
								}
							}
						: null;
				},
				async verifyPassword() {}
			}
		},
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {} as APIServices['workspaces'],
		overview: {
			get: async (userId: string) => {
				requestedUsers.push(userId);
				const total = { amountMinor: '0', missingRate: false };
				return {
					reportingCurrency: 'PLN',
					personalNetWorth: total,
					householdNetWorth: total,
					combinedNetWorth: total,
					currentMonthSpending: { ...total, originals: [] },
					accounts: [],
					upcoming: [],
					workspaces: []
				};
			}
		}
	};
}

test('My overview is private to the authenticated user', async () => {
	const app = createAPI(services());
	assert.equal((await app.request('/api/overview')).status, 401);

	const owner = await app.request('/api/overview', {
		headers: { authorization: 'Session owner' }
	});
	assert.equal(owner.status, 200);
	await owner.json();
	assert.equal(requestedUsers.at(-1), 'owner');

	const member = await app.request('/api/overview?userId=owner', {
		headers: { authorization: 'Session member' }
	});
	assert.equal(member.status, 200);
	await member.json();
	assert.equal(requestedUsers.at(-1), 'member');
});
