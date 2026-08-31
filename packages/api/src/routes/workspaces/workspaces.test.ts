import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '@dukat/db/connection';
import { testClient } from 'hono/testing';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createWorkspaceRepository, WorkspaceError } from '@dukat/db/repositories/workspaces';
import { user, workspaceMembership } from '@dukat/db/schema/index';

import { createAPI } from '../../app';
import type { APIServices, WorkspaceService, WorkspaceSummary } from '../../services';

const personalWorkspace: WorkspaceSummary = {
	id: 'workspace-1',
	name: 'Personal',
	type: 'personal',
	reportingCurrency: null,
	version: 1,
	role: null
};

function createServices(
	options: {
		verified?: boolean;
		workspace?: Partial<WorkspaceService>;
		verifyPassword?: () => void;
	} = {}
): APIServices {
	const workspaces: WorkspaceService = {
		async listAuthorized(userId) {
			assert.equal(userId, 'user-1');
			return [personalWorkspace];
		},
		async findAuthorized(context) {
			return context.workspaceId === personalWorkspace.id ? personalWorkspace : undefined;
		},
		async createHousehold(_userId, input) {
			return input;
		},
		async updateHousehold() {},
		async listMembers() {
			return [];
		},
		async listInvitations() {
			return [];
		},
		async invite() {},
		async revokeInvitation() {},
		async resendInvitation() {},
		async acceptInvitation() {},
		async changeMember() {},
		async leaveHousehold() {},
		async deleteHousehold() {},
		async listRecoverable() {
			return [];
		},
		async restoreHousehold() {},
		async accountDeletionPreflight() {
			return [];
		},
		async deleteAccount() {},
		...options.workspace
	};
	return {
		auth: {
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
			async handler() {
				return new Response(null, { status: 404 });
			},
			api: {
				async getSession({ headers }) {
					return headers.get('authorization') === 'Session test'
						? {
								user: {
									id: 'user-1',
									name: 'User One',
									username: 'user_one',
									email: 'user@example.com',
									emailVerified: options.verified ?? true,
									image: null
								}
							}
						: null;
				},
				async verifyPassword() {
					options.verifyPassword?.();
				}
			}
		},
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {} as APIServices['ledger'],
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces
	};
}

test('workspace routes require a session', async () => {
	const response = await createAPI(createServices()).request('/api/workspaces');

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), { message: 'Unauthorized' });
});

test('member HTTP responses expose public identity and preserve household isolation', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-members-api-'));
	const connection = createDatabase({ url: `file:${join(directory, 'members.db')}` });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../../../../db/src/migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{
				id: 'owner',
				name: 'Ada Lovelace',
				username: 'ada_lovelace',
				email: 'ada@example.com',
				image: '/profile-images/ada.webp'
			},
			{
				id: 'member',
				name: 'Prince',
				username: 'prince',
				email: 'prince@example.com',
				image: null
			},
			{
				id: 'outsider',
				name: 'Outside User',
				username: 'outside_user',
				email: 'outside@example.com',
				image: null
			}
		]);
		const repository = createWorkspaceRepository(connection.db);
		const household = await repository.createHousehold('owner', {
			name: 'Home',
			reportingCurrency: 'EUR'
		});
		await connection.db.insert(workspaceMembership).values({
			workspaceId: household.id,
			userId: 'member',
			role: 'member'
		});
		await repository.createHousehold('outsider', {
			name: 'Other home',
			reportingCurrency: 'EUR'
		});

		const services = createServices();
		services.workspaces = repository;
		services.auth.api.getSession = async ({ headers }) => {
			const userId = headers.get('authorization')?.replace('Session ', '');
			if (!userId) return null;
			return {
				user: {
					id: userId,
					name: userId,
					username: userId,
					email: `${userId}@example.com`,
					emailVerified: true,
					image: null
				}
			};
		};
		const app = createAPI(services);
		const path = `/api/workspaces/${household.id}/members`;

		for (const userId of ['owner', 'member']) {
			const response = await app.request(path, {
				headers: { authorization: `Session ${userId}` }
			});
			assert.equal(response.status, 200);
			const members = (await response.json()) as Array<Record<string, unknown>>;
			assert.equal(members.length, 2);
			assert.ok(members.every((member) => !('email' in member)));
			assert.deepEqual(
				members
					.map(({ name, username, image }) => ({ name, username, image }))
					.sort((a, b) => String(a.name).localeCompare(String(b.name))),
				[
					{ name: 'Ada Lovelace', username: 'ada_lovelace', image: '/profile-images/ada.webp' },
					{ name: 'Prince', username: 'prince', image: null }
				]
			);
		}

		const isolated = await app.request(path, {
			headers: { authorization: 'Session outsider' }
		});
		assert.equal(isolated.status, 404);
		assert.equal(((await isolated.json()) as { message: string }).message, 'Workspace not found');
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('typed routes create households and require verified email for invitation acceptance', async () => {
	let accepted: unknown;
	const workspace = {
		async acceptInvitation(...args: [string, string, string]) {
			accepted = args;
			return { ok: true };
		}
	};
	const unverified = testClient(createAPI(createServices({ verified: false, workspace })));
	const headers = { authorization: 'Session test' };
	assert.equal(
		(
			await unverified.api['workspace-invitations'][':token'].accept.$post(
				{ param: { token: 'token' } },
				{ headers }
			)
		).status,
		400
	);
	assert.equal(accepted, undefined);
	const client = testClient(createAPI(createServices({ workspace })));
	const created = await client.api.workspaces.$post(
		{ json: { name: 'House', reportingCurrency: 'EUR' } },
		{ headers }
	);
	assert.deepEqual(await created.json(), { name: 'House', reportingCurrency: 'EUR' });
	assert.equal(
		(
			await client.api['workspace-invitations'][':token'].accept.$post(
				{ param: { token: 'token' } },
				{ headers }
			)
		).status,
		200
	);
	assert.deepEqual(accepted, ['user-1', 'user@example.com', 'token']);
});

test('delete confirmation precedes password verification and strips password from repository input', async () => {
	let verified = 0,
		deleted: unknown;
	const workspace = {
		async findAuthorized() {
			return { ...personalWorkspace, name: 'Home' };
		},
		async deleteHousehold(_context: unknown, input: unknown) {
			deleted = input;
		}
	};
	const client = testClient(
		createAPI(createServices({ workspace, verifyPassword: () => verified++ }))
	);
	const headers = { authorization: 'Session test' };
	const route = client.api.workspaces[':workspaceId'].delete;
	const body = { version: 1, password: 'secret', confirmation: 'Wrong', idempotencyKey: 'key' };
	assert.equal(
		(await route.$post({ param: { workspaceId: 'workspace-1' }, json: body }, { headers })).status,
		400
	);
	assert.equal(verified, 0);
	assert.equal(deleted, undefined);
	assert.equal(
		(
			await route.$post(
				{ param: { workspaceId: 'workspace-1' }, json: { ...body, confirmation: 'Home' } },
				{ headers }
			)
		).status,
		200
	);
	assert.equal(verified, 1);
	assert.deepEqual(deleted, { version: 1, idempotencyKey: 'key' });
});

test('restore returns JSON when the repository operation has no return value', async () => {
	let restored: unknown;
	const client = testClient(
		createAPI(
			createServices({
				workspace: {
					async restoreHousehold(context, version) {
						restored = { context, version };
					}
				}
			})
		)
	);
	const response = await client.api.workspaces[':workspaceId'].restore.$post(
		{ param: { workspaceId: 'workspace-1' }, json: { version: 2 } },
		{ headers: { authorization: 'Session test' } }
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { restored: true });
	assert.deepEqual(restored, {
		context: { userId: 'user-1', workspaceId: 'workspace-1' },
		version: 2
	});
});

test('account deletion requires server confirmation and deletes only after password verification', async () => {
	let verified = 0,
		deletedUserId: string | undefined;
	const client = testClient(
		createAPI(
			createServices({
				verifyPassword: () => verified++,
				workspace: {
					async deleteAccount(userId) {
						deletedUserId = userId;
					}
				}
			})
		)
	);
	const headers = { authorization: 'Session test' };
	const route = client.api.account.delete;
	assert.equal(
		(
			await route.$post(
				{ json: { password: 'secret', confirmation: 'WRONG' as 'DELETE' } },
				{ headers }
			)
		).status,
		400
	);
	assert.equal(verified, 0);
	assert.equal(deletedUserId, undefined);
	assert.equal(
		(await route.$post({ json: { password: 'secret', confirmation: 'DELETE' } }, { headers }))
			.status,
		200
	);
	assert.equal(verified, 1);
	assert.equal(deletedUserId, 'user-1');
});

test('WorkspaceError codes map to 404, 409 and 400, and member action parameters are parsed', async () => {
	const headers = { authorization: 'Session test' };
	for (const [code, status] of [
		['not_found', 404],
		['conflict', 409],
		['invalid', 400]
	] as const) {
		const client = testClient(
			createAPI(
				createServices({
					workspace: {
						async createHousehold() {
							throw new WorkspaceError(code, code);
						}
					}
				})
			)
		);
		assert.equal(
			(
				await client.api.workspaces.$post(
					{ json: { name: 'Home', reportingCurrency: 'EUR' } },
					{ headers }
				)
			).status,
			status
		);
	}
	let received: unknown;
	const client = testClient(
		createAPI(
			createServices({
				workspace: {
					async changeMember(...args: Parameters<WorkspaceService['changeMember']>) {
						received = args;
					}
				}
			})
		)
	);
	const response = await client.api.workspaces[':workspaceId'].members[':userId'][':action'].$post(
		{ param: { workspaceId: 'home', userId: 'target', action: 'promote' }, json: { version: 7 } },
		{ headers }
	);
	assert.equal(response.status, 200);
	assert.deepEqual(received, [
		{ userId: 'user-1', workspaceId: 'home' },
		'target',
		{ action: 'promote', version: 7 }
	]);
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
