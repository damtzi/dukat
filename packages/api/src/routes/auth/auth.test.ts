import assert from 'node:assert/strict';
import test from 'node:test';

import { createAPI } from '../../app';
import type { APIServices } from '../../services';

test('auth routes delegate the unchanged same-origin request', async () => {
	let delegatedRequest: Request | undefined;
	const services: APIServices = {
		auth: {
			async handler(request) {
				delegatedRequest = request;
				return Response.json({ delegated: true });
			},
			api: {
				async getSession() {
					return null;
				},
				async verifyPassword() {}
			}
		},
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {
			async listAuthorized() {
				return [];
			},
			async findAuthorized() {
				return undefined;
			}
		} as unknown as APIServices['workspaces']
	};

	const response = await createAPI(services).request(
		'http://dukat.test/api/auth/sign-in/email?callbackURL=%2Fdashboard',
		{ method: 'POST' }
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { delegated: true });
	assert.equal(
		delegatedRequest?.url,
		'http://dukat.test/api/auth/sign-in/email?callbackURL=%2Fdashboard'
	);
	assert.equal(delegatedRequest?.method, 'POST');
});
