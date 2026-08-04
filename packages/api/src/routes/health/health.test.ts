import assert from 'node:assert/strict';
import test from 'node:test';

import { createAPI } from '../../app';
import type { APIServices } from '../../services';

function createServices(readiness: () => Promise<unknown>): APIServices {
	return {
		auth: {
			async handler() {
				return new Response(null, { status: 404 });
			},
			api: {
				async getSession() {
					return null;
				},
				async verifyPassword() {}
			}
		},
		readiness,
		ledger: {} as APIServices['ledger'],
		workspaces: {
			async listAuthorized() {
				return [];
			},
			async findAuthorized() {
				return undefined;
			}
		} as unknown as APIServices['workspaces']
	};
}

test('health routes distinguish liveness from readiness', async () => {
	const readyApp = createAPI(createServices(async () => undefined));
	assert.equal((await readyApp.request('/api/health/live')).status, 200);
	assert.equal((await readyApp.request('/api/health/ready')).status, 200);

	const unavailableApp = createAPI(
		createServices(async () => {
			throw new Error('database unavailable');
		})
	);
	const unavailable = await unavailableApp.request('/api/health/ready');
	assert.equal(unavailable.status, 503);
	assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
});

test('OpenAPI exposes the composed health and workspace contracts', async () => {
	const response = await createAPI(createServices(async () => undefined)).request('/api/doc');
	const document = (await response.json()) as { paths: Record<string, unknown> };

	assert.equal(response.status, 200);
	assert.ok(document.paths['/api/health/live']);
	assert.ok(document.paths['/api/health/ready']);
	assert.ok(document.paths['/api/workspaces']);
	assert.ok(document.paths['/api/workspaces/{workspaceId}']);
});
