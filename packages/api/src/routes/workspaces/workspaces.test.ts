import assert from 'node:assert/strict';
import test from 'node:test';

import { testClient } from 'hono/testing';

import { createAPI } from '../../app';
import type { APIServices, WorkspaceSummary } from '../../services';

const personalWorkspace: WorkspaceSummary = {
	id: 'workspace-1',
	name: 'Personal',
	type: 'personal'
};

function createServices(): APIServices {
	return {
		auth: {
			async handler() {
				return new Response(null, { status: 404 });
			},
			api: {
				async getSession({ headers }) {
					return headers.get('authorization') === 'Session test'
						? { user: { id: 'user-1' } }
						: null;
				}
			}
		},
		async readiness() {},
		ledger: {} as APIServices['ledger'],
		workspaces: {
			async listAuthorized(userId) {
				assert.equal(userId, 'user-1');
				return [personalWorkspace];
			},
			async findAuthorized(context) {
				assert.equal(context.userId, 'user-1');
				return context.workspaceId === personalWorkspace.id ? personalWorkspace : undefined;
			}
		}
	};
}

test('workspace routes require a session', async () => {
	const response = await createAPI(createServices()).request('/api/workspaces');

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), { message: 'Unauthorized' });
});

test('typed workspace client lists and finds authorized workspaces', async () => {
	const client = testClient(createAPI(createServices()));
	const headers = { authorization: 'Session test' };

	const listResponse = await client.api.workspaces.$get({}, { headers });
	assert.equal(listResponse.status, 200);
	assert.deepEqual(await listResponse.json(), [personalWorkspace]);

	const getResponse = await client.api.workspaces[':workspaceId'].$get(
		{ param: { workspaceId: personalWorkspace.id } },
		{ headers }
	);
	assert.equal(getResponse.status, 200);
	assert.deepEqual(await getResponse.json(), personalWorkspace);

	const missingResponse = await client.api.workspaces[':workspaceId'].$get(
		{ param: { workspaceId: 'missing' } },
		{ headers }
	);
	assert.equal(missingResponse.status, 404);
});
