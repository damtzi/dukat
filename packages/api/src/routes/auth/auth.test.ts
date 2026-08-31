import assert from 'node:assert/strict';
import test from 'node:test';

import { createAPI } from '../../app';
import type { APIServices } from '../../services';

test('auth routes delegate the unchanged same-origin request', async () => {
	let delegatedRequest: Request | undefined;
	const services: APIServices = {
		auth: {
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
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

test('username availability delegates to the Better Auth handler', async () => {
	let delegatedRequest: Request | undefined;
	const services = {
		auth: {
			async handler(request: Request) {
				delegatedRequest = request;
				return Response.json(
					{ available: false, username: 'ada', message: 'That username is already taken.' },
					{ headers: { 'cache-control': 'no-store' } }
				);
			}
		}
	} as unknown as APIServices;
	const response = await createAPI(services).request(
		'http://dukat.test/api/auth/username-availability?username=ada'
	);

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.deepEqual(await response.json(), {
		available: false,
		username: 'ada',
		message: 'That username is already taken.'
	});
	assert.equal(
		delegatedRequest?.url,
		'http://dukat.test/api/auth/username-availability?username=ada'
	);
});

test('auth sign-out normalizes the internal Better Auth request body', async () => {
	let delegatedRequest: Request | undefined;
	const services = {
		auth: {
			async handler(request: Request) {
				delegatedRequest = request;
				return Response.json({ delegated: true });
			}
		}
	} as unknown as APIServices;

	const response = await createAPI(services).request('http://dukat.test/api/auth/sign-out', {
		method: 'POST'
	});

	assert.equal(response.status, 200);
	assert.equal(await delegatedRequest?.text(), '{}');
	assert.equal(delegatedRequest?.headers.get('content-type'), 'application/json');
});
