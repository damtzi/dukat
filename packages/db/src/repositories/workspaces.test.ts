import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import {
	account,
	emailOutbox,
	session,
	user,
	workspace,
	workspaceInvitation,
	workspaceMembership
} from '../schema';
import { createWorkspaceRepository, findSoleOwnerBlockers, WorkspaceError } from './workspaces';
import { createLedgerRepository } from './ledger';
import { assertDatabaseIntegrity } from '../recovery';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-workspaces-'));
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	await migrate(connection.db, {
		migrationsFolder
	});
	await connection.db.insert(user).values([
		{ id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com' },
		{ id: 'member', name: 'Member', username: 'member', email: 'member@example.com' },
		{ id: 'invitee', name: 'Invitee', username: 'invitee', email: 'invitee@example.com' },
		{ id: 'other', name: 'Other', username: 'other', email: 'other@example.com' }
	]);
	return {
		...connection,
		directory,
		repo: createWorkspaceRepository(connection.db),
		async close() {
			connection.client.close();
			await rm(directory, { recursive: true, force: true });
		}
	};
}
const denied = (promise: Promise<unknown>) =>
	assert.rejects(promise, (e) => e instanceof WorkspaceError && e.code === 'not_found');

test('full migrations through 0005 create global transfer shape; household creation grants owner and summaries', async () => {
	const f = await fixture();
	try {
		const columns = await f.client.execute('PRAGMA table_info(ledger_transfer)');
		assert.deepEqual(
			columns.rows.map((r) => r.name),
			[
				'id',
				'sent_amount_minor',
				'received_amount_minor',
				'date',
				'description',
				'version',
				'trashed_at',
				'detached_at',
				'created_at',
				'updated_at'
			]
		);
		const created = await f.repo.createHousehold('owner', {
			name: 'Home',
			reportingCurrency: 'EUR'
		});
		assert.deepEqual(
			(
				await f.db
					.select()
					.from(workspaceMembership)
					.where(eq(workspaceMembership.workspaceId, created.id))
			).map((r) => [r.userId, r.role]),
			[['owner', 'owner']]
		);
		assert.deepEqual(
			await f.repo.findAuthorized({ userId: 'owner', workspaceId: created.id }),
			created
		);
		assert.ok(
			(await f.repo.listAuthorized('owner')).some(
				(w) => w.id === created.id && w.reportingCurrency === 'EUR' && w.version === 1
			)
		);
		await f.db
			.update(workspace)
			.set({ reportingCurrency: 'BGN' })
			.where(eq(workspace.id, created.id));
		assert.deepEqual(
			await f.repo.updateHousehold(
				{ userId: 'owner', workspaceId: created.id },
				{ name: 'Renamed home', reportingCurrency: 'BGN', version: 1 }
			),
			{ version: 2 }
		);
		await assert.rejects(
			() =>
				f.repo.updateHousehold(
					{ userId: 'owner', workspaceId: created.id },
					{ reportingCurrency: 'XYZ', version: 2 }
				),
			(error) => error instanceof WorkspaceError && error.code === 'invalid'
		);
	} finally {
		await f.close();
	}
});

test('populated databases upgrade from 0003 without losing workspace or ledger data', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-upgrade-'));
	const partialMigrations = join(directory, 'migrations');
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	try {
		await mkdir(join(partialMigrations, 'meta'), { recursive: true });
		for (const name of [
			'0000_organic_wild_pack.sql',
			'0001_high_lilith.sql',
			'0002_bent_masked_marvel.sql',
			'0003_watery_ricochet.sql'
		]) {
			await cp(join(migrationsFolder, name), join(partialMigrations, name));
		}
		const journal = JSON.parse(
			await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8')
		) as { entries: unknown[] };
		journal.entries = journal.entries.slice(0, 4);
		await writeFile(join(partialMigrations, 'meta/_journal.json'), JSON.stringify(journal));
		await migrate(connection.db, { migrationsFolder: partialMigrations });

		await connection.client.execute(
			"INSERT INTO user (id,name,email,email_verified) VALUES ('upgrade-user','Upgrade','upgrade@example.com',1)"
		);
		const personal = await connection.client.execute(
			"SELECT id FROM workspace WHERE personal_owner_user_id = 'upgrade-user'"
		);
		const workspaceId = String(personal.rows[0].id);
		await connection.client.batch(
			[
				`INSERT INTO financial_account (id,workspace_id,name,type,currency,opening_balance_minor) VALUES ('from-account','${workspaceId}','From','current','EUR',0)`,
				`INSERT INTO financial_account (id,workspace_id,name,type,currency,opening_balance_minor) VALUES ('to-account','${workspaceId}','To','savings','EUR',0)`,
				`INSERT INTO ledger_transfer (id,workspace_id,from_account_id,to_account_id,amount_minor,date,description) VALUES ('transfer','${workspaceId}','from-account','to-account',1250,'2026-08-01','Upgrade transfer')`,
				`INSERT INTO ledger_transaction (id,workspace_id,account_id,kind,amount_minor,date,description,source,transfer_id,transfer_side) VALUES ('from-leg','${workspaceId}','from-account','expense',1250,'2026-08-01','Upgrade transfer','transfer','transfer','from')`,
				`INSERT INTO ledger_transaction (id,workspace_id,account_id,kind,amount_minor,date,description,source,transfer_id,transfer_side) VALUES ('to-leg','${workspaceId}','to-account','income',1250,'2026-08-01','Upgrade transfer','transfer','transfer','to')`,
				`INSERT INTO ledger_audit (id,workspace_id,actor_user_id,entity_type,entity_id,action) VALUES ('audit','${workspaceId}','upgrade-user','transfer','transfer','create')`,
				`INSERT INTO mutation_receipt (id,workspace_id,actor_user_id,operation,idempotency_key,request_json,response_json) VALUES ('receipt','${workspaceId}','upgrade-user','transfer.create','upgrade-key','{}','{}')`
			],
			'write'
		);

		await migrate(connection.db, { migrationsFolder });
		for (const [table, expected] of [
			['user', 1],
			['workspace', 1],
			['financial_account', 2],
			['ledger_transfer', 1],
			['ledger_transaction', 2],
			['ledger_audit', 1],
			['mutation_receipt', 1]
		] as const) {
			const result = await connection.client.execute(`SELECT count(*) AS count FROM ${table}`);
			assert.equal(Number(result.rows[0].count), expected, table);
		}
		const transfer = await connection.client.execute(
			"SELECT date, description, detached_at FROM ledger_transfer WHERE id = 'transfer'"
		);
		assert.deepEqual(transfer.rows[0], {
			date: '2026-08-01',
			description: 'Upgrade transfer',
			detached_at: null
		});
		const openingDates = await connection.client.execute(
			'SELECT opening_date FROM financial_account ORDER BY id'
		);
		assert.deepEqual(
			openingDates.rows.map((row) => row.opening_date),
			['2026-07-31', '2026-07-31']
		);
		const foreignKeys = await connection.client.execute('PRAGMA foreign_key_check');
		assert.equal(foreignKeys.rows.length, 0);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('detached legacy transfers backfill both aggregates before constraints apply', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-detached-upgrade-'));
	const partialMigrations = join(directory, 'migrations');
	const connection = createDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
	let financial: ReturnType<typeof createFinancialDatabase> | undefined;
	try {
		await mkdir(join(partialMigrations, 'meta'), { recursive: true });
		const journal = JSON.parse(
			await readFile(join(migrationsFolder, 'meta/_journal.json'), 'utf8')
		) as { entries: Array<{ idx: number; tag: string }> };
		const beforeConstraints = journal.entries.slice(0, 11);
		for (const entry of beforeConstraints)
			await cp(
				join(migrationsFolder, `${entry.tag}.sql`),
				join(partialMigrations, `${entry.tag}.sql`)
			);
		await writeFile(
			join(partialMigrations, 'meta/_journal.json'),
			JSON.stringify({ ...journal, entries: beforeConstraints })
		);
		await migrate(connection.db, { migrationsFolder: partialMigrations });
		await connection.client.execute(
			"INSERT INTO user (id, name, email) VALUES ('legacy-owner', 'Owner', 'legacy-owner@example.com')"
		);
		await connection.client.batch([
			"INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES ('legacy-account', 'legacy-owner', 'credential', 'legacy-owner', 'hash', unixepoch())",
			"INSERT INTO session (id, expires_at, token, updated_at, user_id) VALUES ('legacy-session', unixepoch() + 3600, 'legacy-token', unixepoch(), 'legacy-owner')"
		]);
		const personal = await connection.client.execute(
			"SELECT id FROM workspace WHERE personal_owner_user_id = 'legacy-owner'"
		);
		const workspaceId = String(personal.rows[0].id);
		await connection.client.batch([
			`INSERT INTO financial_account (id,workspace_id,name,type,currency,opening_balance_minor) VALUES ('legacy-source','${workspaceId}','Source','current','EUR',2000)`,
			`INSERT INTO ledger_transfer (id,sent_amount_minor,received_amount_minor,date,detached_at) VALUES ('legacy-detached',1250,NULL,'2026-08-01',unixepoch())`,
			`INSERT INTO ledger_transaction (id,workspace_id,account_id,kind,amount_minor,date,source,transfer_id,transfer_side) VALUES ('legacy-leg','${workspaceId}','legacy-source','expense',1250,'2026-08-01','transfer','legacy-detached','from')`
		]);
		await migrate(connection.db, { migrationsFolder });
		const preservedAuth = await connection.client.batch([
			"SELECT username FROM user WHERE id = 'legacy-owner'",
			"SELECT id FROM account WHERE id = 'legacy-account'",
			"SELECT id FROM session WHERE id = 'legacy-session'"
		]);
		assert.match(String(preservedAuth[0].rows[0].username), /^[a-z][a-z0-9_]{2,29}$/);
		assert.equal(preservedAuth[1].rows.length, 1);
		assert.equal(preservedAuth[2].rows.length, 1);
		financial = createFinancialDatabase({ url: `file:${join(directory, 'db.sqlite')}` });
		const [transfer] = await createLedgerRepository(financial.db).listTransfers(
			{ userId: 'legacy-owner', workspaceId },
			'legacy-source'
		);
		assert.equal(transfer.sentAmountMinor, '1250');
		assert.equal(transfer.receivedAmountMinor, null, 'missing side remains private after backfill');
		await assertDatabaseIntegrity(financial.client);
	} finally {
		financial?.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('members may list members but owner-only workspace and invitation actions are denied', async () => {
	const f = await fixture();
	try {
		const w = await f.repo.createHousehold('owner', { name: 'Home', reportingCurrency: 'EUR' });
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: w.id, userId: 'member', role: 'member' });
		assert.equal((await f.repo.listMembers({ userId: 'member', workspaceId: w.id })).length, 2);
		const c = { userId: 'member', workspaceId: w.id };
		await denied(f.repo.updateHousehold(c, { name: 'No', version: 1 }));
		await denied(f.repo.invite(c, { email: 'x@example.com', version: 1, invitationUrl: String }));
		await denied(f.repo.listInvitations(c));
		await denied(f.repo.changeMember(c, 'owner', { action: 'remove', version: 1 }));
		await denied(f.repo.deleteHousehold(c, { version: 1 }));
	} finally {
		await f.close();
	}
});

test('invitation normalization, secrecy, conflicts, resend, revoke, acceptance and token states', async () => {
	const f = await fixture();
	try {
		const w = await f.repo.createHousehold('owner', { name: 'Home', reportingCurrency: 'EUR' });
		let raw = '';
		const invitation = await f.repo.invite(
			{ userId: 'owner', workspaceId: w.id },
			{ email: ' Invitee@Example.COM ', version: 1, invitationUrl: (t) => (raw = t) }
		);
		assert.equal(invitation.email, 'invitee@example.com');
		assert.ok(invitation.expiresAt.getTime() - Date.now() > 6.9 * 86400_000);
		const [row] = await f.db
			.select()
			.from(workspaceInvitation)
			.where(eq(workspaceInvitation.id, invitation.id));
		assert.notEqual(row.tokenHash, raw);
		assert.ok(!JSON.stringify(row).includes(raw));
		assert.equal((await f.repo.listInvitations({ userId: 'owner', workspaceId: w.id })).length, 1);
		const claimed = await f.repo.claimPendingOutbox();
		assert.ok(claimed);
		assert.deepEqual(await f.repo.isOutboxClaimActive(claimed.id, claimed.attempts), {
			active: true,
			terminal: false
		});
		await assert.rejects(
			() =>
				f.repo.invite(
					{ userId: 'owner', workspaceId: w.id },
					{ email: 'invitee@example.com', version: 2, invitationUrl: String }
				),
			/already a member or invited/i
		);
		const resent = await f.repo.resendInvitation(
			{ userId: 'owner', workspaceId: w.id },
			invitation.id,
			{ version: 2, invitationUrl: (t) => (raw = t) }
		);
		assert.equal(resent.generation, 2);
		const rows = await f.db.select().from(workspaceInvitation);
		assert.equal(rows.find((r) => r.id === resent.id)?.resendsInvitationId, invitation.id);
		assert.ok(rows.find((r) => r.id === invitation.id)?.revokedAt);
		assert.equal(
			(await f.db.select().from(emailOutbox).where(eq(emailOutbox.invitationId, invitation.id)))[0]
				.body,
			null
		);
		assert.deepEqual(await f.repo.isOutboxClaimActive(claimed.id, claimed.attempts), {
			active: false,
			terminal: false
		});
		await f.repo.markOutboxSent(claimed.id, claimed.attempts);
		assert.equal(
			(await f.db.select().from(emailOutbox).where(eq(emailOutbox.id, claimed.id)))[0].sentAt,
			null
		);
		await denied(f.repo.acceptInvitation('invitee', 'wrong@example.com', raw));
		await f.repo.acceptInvitation('invitee', 'INVITEE@example.com', raw);
		assert.equal(
			(await f.db.select().from(emailOutbox).where(eq(emailOutbox.invitationId, resent.id)))[0]
				.body,
			null
		);
		assert.ok(
			(await f.repo.listMembers({ userId: 'owner', workspaceId: w.id })).some(
				(m) => m.userId === 'invitee'
			)
		);
		await denied(f.repo.acceptInvitation('invitee', 'invitee@example.com', raw));
		const expired = await f.repo.invite(
			{ userId: 'owner', workspaceId: w.id },
			{ email: 'other@example.com', version: 4, invitationUrl: (t) => (raw = t) }
		);
		const oldClaim = await f.repo.claimPendingOutbox();
		assert.ok(oldClaim);
		await f.db
			.update(emailOutbox)
			.set({ createdAt: new Date(0) })
			.where(eq(emailOutbox.id, oldClaim.id));
		assert.deepEqual(await f.repo.isOutboxClaimActive(oldClaim.id, oldClaim.attempts), {
			active: false,
			terminal: true
		});
		assert.equal(
			(await f.db.select().from(emailOutbox).where(eq(emailOutbox.id, oldClaim.id)))[0].body,
			null
		);
		await f.db
			.update(workspaceInvitation)
			.set({ expiresAt: new Date(0) })
			.where(eq(workspaceInvitation.id, expired.id));
		await denied(f.repo.acceptInvitation('other', 'other@example.com', raw));
	} finally {
		await f.close();
	}
});

test('accepted workspace is the same shared workspace for owner and member', async () => {
	const f = await fixture();
	try {
		const shared = await f.repo.createHousehold('owner', {
			name: 'Shared home',
			reportingCurrency: 'EUR'
		});
		let token = '';
		await f.repo.invite(
			{ userId: 'owner', workspaceId: shared.id },
			{
				email: 'invitee@example.com',
				version: shared.version,
				invitationUrl: (value) => (token = value)
			}
		);
		await f.repo.acceptInvitation('invitee', 'invitee@example.com', token);

		const ownerView = (await f.repo.listAuthorized('owner')).find(({ id }) => id === shared.id);
		const memberView = (await f.repo.listAuthorized('invitee')).find(({ id }) => id === shared.id);
		assert.ok(ownerView);
		assert.ok(memberView);
		assert.equal(ownerView.id, memberView.id);
		assert.equal(ownerView.role, 'owner');
		assert.equal(memberView.role, 'member');
	} finally {
		await f.close();
	}
});

test('membership changes enforce sole-owner safety and remove access immediately', async () => {
	const f = await fixture();
	try {
		const w = await f.repo.createHousehold('owner', { name: 'Home', reportingCurrency: 'EUR' });
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: w.id, userId: 'member', role: 'member' });
		await assert.rejects(
			() =>
				f.repo.changeMember({ userId: 'owner', workspaceId: w.id }, 'owner', {
					action: 'demote',
					version: 1
				}),
			/retain an owner/i
		);
		await f.repo.changeMember({ userId: 'owner', workspaceId: w.id }, 'member', {
			action: 'promote',
			version: 1
		});
		await f.repo.changeMember({ userId: 'member', workspaceId: w.id }, 'owner', {
			action: 'demote',
			version: 2
		});
		await assert.rejects(
			() => f.repo.leaveHousehold({ userId: 'member', workspaceId: w.id }, 3),
			/another owner/i
		);
		await f.repo.changeMember({ userId: 'member', workspaceId: w.id }, 'owner', {
			action: 'remove',
			version: 3
		});
		assert.equal(await f.repo.findAuthorized({ userId: 'owner', workspaceId: w.id }), undefined);
		assert.ok(!(await f.repo.listAuthorized('owner')).some((x) => x.id === w.id));
	} finally {
		await f.close();
	}
});

test('soft deletion cancels invites, is owner-recoverable, purges at cutoff, and sole-owner blockers include deleted households', async () => {
	const f = await fixture();
	try {
		const w = await f.repo.createHousehold('owner', { name: 'Home', reportingCurrency: 'EUR' });
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: w.id, userId: 'member', role: 'member' });
		await f.repo.invite(
			{ userId: 'owner', workspaceId: w.id },
			{ email: 'other@example.com', version: 1, invitationUrl: String }
		);
		await f.repo.deleteHousehold({ userId: 'owner', workspaceId: w.id }, { version: 2 });
		assert.equal(await f.repo.findAuthorized({ userId: 'owner', workspaceId: w.id }), undefined);
		assert.ok((await findSoleOwnerBlockers(f.db, 'owner')).some((x) => x.id === w.id));
		assert.equal((await f.repo.listRecoverable('owner')).length, 1);
		assert.equal((await f.repo.listRecoverable('member')).length, 0);
		assert.ok((await f.db.select().from(workspaceInvitation))[0].revokedAt);
		await f.repo.restoreHousehold({ userId: 'owner', workspaceId: w.id }, 3);
		await f.repo.deleteHousehold({ userId: 'owner', workspaceId: w.id }, { version: 4 });
		const cutoff = new Date(Date.now() - 30 * 86400_000);
		await f.db.update(workspace).set({ deletedAt: cutoff }).where(eq(workspace.id, w.id));
		assert.deepEqual(
			(await f.repo.purgeExpired()).map((x) => x.id),
			[w.id]
		);
	} finally {
		await f.close();
	}
});

test('database user deletion trigger permits another owner and deletes a sole-member household', async () => {
	const f = await fixture();
	try {
		const shared = await f.repo.createHousehold('owner', {
			name: 'Shared',
			reportingCurrency: 'EUR'
		});
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: shared.id, userId: 'member', role: 'owner' });
		const sole = await f.repo.createHousehold('other', { name: 'Sole', reportingCurrency: 'EUR' });
		await f.db.delete(user).where(eq(user.id, 'owner'));
		assert.ok((await f.db.select().from(workspace).where(eq(workspace.id, shared.id))).length);
		await f.db.delete(user).where(eq(user.id, 'other'));
		assert.equal((await f.db.select().from(workspace).where(eq(workspace.id, sole.id))).length, 0);
	} finally {
		await f.close();
	}
});

test('account deletion is atomic when sole ownership blocks it', async () => {
	const f = await fixture();
	try {
		const household = await f.repo.createHousehold('owner', {
			name: 'Shared',
			reportingCurrency: 'EUR'
		});
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: household.id, userId: 'member', role: 'member' });
		await f.db.insert(account).values({
			id: 'credential',
			accountId: 'owner',
			providerId: 'credential',
			userId: 'owner',
			password: 'hashed-password'
		});
		await f.db.insert(session).values({
			id: 'owner-session',
			token: 'owner-token',
			userId: 'owner',
			expiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date()
		});

		await assert.rejects(
			() => f.repo.deleteAccount('owner'),
			(error) => error instanceof WorkspaceError && error.code === 'conflict'
		);
		assert.equal((await f.db.select().from(user).where(eq(user.id, 'owner'))).length, 1);
		assert.equal((await f.db.select().from(account).where(eq(account.userId, 'owner'))).length, 1);
		assert.equal((await f.db.select().from(session).where(eq(session.userId, 'owner'))).length, 1);

		await f.repo.changeMember({ userId: 'owner', workspaceId: household.id }, 'member', {
			action: 'promote',
			version: 1
		});
		await f.repo.deleteAccount('owner');
		assert.equal((await f.db.select().from(user).where(eq(user.id, 'owner'))).length, 0);
		assert.equal((await f.db.select().from(account).where(eq(account.userId, 'owner'))).length, 0);
		assert.equal((await f.db.select().from(session).where(eq(session.userId, 'owner'))).length, 0);
	} finally {
		await f.close();
	}
});
