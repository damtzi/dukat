import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createDatabase } from '@dukat/db/connection';
import { migrate } from 'drizzle-orm/libsql/migrator';

const migrationsFolder = fileURLToPath(
	new URL('../../../packages/db/src/migrations', import.meta.url)
);

async function createMigrationPrefix(directory: string, lastMigrationIndex: number) {
	const prefixFolder = join(directory, 'migration-prefix');
	const prefixMetaFolder = join(prefixFolder, 'meta');
	await mkdir(prefixMetaFolder, { recursive: true });

	const journal = JSON.parse(
		await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
	) as { entries: Array<{ idx: number; tag: string }> };
	journal.entries = journal.entries.filter((entry) => entry.idx <= lastMigrationIndex);

	await Promise.all([
		...journal.entries.map((entry) =>
			cp(join(migrationsFolder, `${entry.tag}.sql`), join(prefixFolder, `${entry.tag}.sql`))
		),
		writeFile(join(prefixMetaFolder, '_journal.json'), JSON.stringify(journal))
	]);
	return prefixFolder;
}

test('original user data survives every upgrade after the initial schema', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-original-migrations-'));
	const connection = createDatabase({ url: `file:${join(directory, 'original.db')}` });
	try {
		await migrate(connection.db, { migrationsFolder: await createMigrationPrefix(directory, 0) });
		await connection.client.execute(
			"INSERT INTO user (id, name, email, email_verified) VALUES ('original-user', 'Original User', 'original@example.com', 1)"
		);
		await connection.client.execute(
			"INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at) VALUES ('original-credential', 'original-user', 'credential', 'original-user', 'synthetic-password-hash', 1704067200)"
		);
		await migrate(connection.db, { migrationsFolder });
		const result = await connection.client.execute(
			"SELECT u.id, u.name, u.email, u.email_verified, a.password FROM user u JOIN account a ON a.user_id = u.id WHERE u.id = 'original-user'"
		);
		assert.deepEqual(result.rows, [
			{
				id: 'original-user',
				name: 'Original User',
				email: 'original@example.com',
				email_verified: 1,
				password: 'synthetic-password-hash'
			}
		]);
		const personal = await connection.client.execute(
			"SELECT COUNT(*) AS count FROM workspace WHERE type = 'personal' AND personal_owner_user_id = 'original-user'"
		);
		assert.equal(personal.rows[0].count, 1);
		const identity = await connection.client.execute(
			"SELECT username FROM user WHERE id = 'original-user'"
		);
		assert.match(String(identity.rows[0].username), /^[a-z][a-z0-9_]{2,29}$/);
		assert.deepEqual((await connection.client.execute('PRAGMA integrity_check')).rows, [
			{ integrity_check: 'ok' }
		]);
		assert.deepEqual((await connection.client.execute('PRAGMA foreign_key_check')).rows, []);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('representative pre-core data survives the release migration chain', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-release-migrations-'));
	const connection = createDatabase({ url: `file:${join(directory, 'representative.db')}` });

	try {
		const prefixFolder = await createMigrationPrefix(directory, 15);
		await migrate(connection.db, { migrationsFolder: prefixFolder });

		// Seed against the real schema at 0015, immediately before opening_date and the
		// later core table rebuilds. The user trigger creates this personal workspace.
		await connection.client.execute(
			"INSERT INTO user (id, name, username, email, email_verified, created_at, updated_at) VALUES ('release-user', 'Release User', 'release_user', 'release@example.com', 1, 1704067200, 1704067200)"
		);
		const workspaceResult = await connection.client.execute(
			"SELECT id FROM workspace WHERE personal_owner_user_id = 'release-user'"
		);
		const workspaceId = String(workspaceResult.rows[0]?.id);
		assert.notEqual(workspaceId, 'undefined');

		for (const sql of [
			`INSERT INTO workspace_membership (workspace_id, user_id, role) VALUES ('${workspaceId}', 'release-user', 'owner')`,
			`INSERT INTO financial_account (id, workspace_id, name, type, currency, opening_balance_minor, created_at, updated_at) VALUES ('account-1', '${workspaceId}', 'Representative account', 'current', 'EUR', -9007199254740993, 1704067200, 1704067200)`,
			`INSERT INTO ledger_category (id, workspace_id, name, normalized_name) VALUES ('category-1', '${workspaceId}', 'Migration keepsakes', 'migration keepsakes')`,
			`INSERT INTO ledger_transaction (id, workspace_id, account_id, category_id, kind, amount_minor, date, description) VALUES ('transaction-1', '${workspaceId}', 'account-1', 'category-1', 'expense', 9007199254740993, '2024-02-10', 'Representative purchase')`,
			`INSERT INTO ledger_balance_correction (id, workspace_id, account_id, date, amount_minor, description) VALUES ('correction-1', '${workspaceId}', 'account-1', '2024-02-05', '-9876543210987', 'Imported correction')`,
			`INSERT INTO ledger_balance_check (id, workspace_id, account_id, date, observed_balance_minor) VALUES ('check-1', '${workspaceId}', 'account-1', '2024-02-01', 1234567890123)`
		]) {
			await connection.client.execute(sql);
		}

		await migrate(connection.db, { migrationsFolder });

		const account = await connection.client.execute(
			"SELECT workspace_id, opening_date, CAST(opening_balance_minor AS TEXT) AS opening_balance_minor FROM financial_account WHERE id = 'account-1'"
		);
		assert.deepEqual(account.rows[0], {
			workspace_id: workspaceId,
			opening_date: '2024-02-01',
			opening_balance_minor: '-9007199254740993'
		});
		const transaction = await connection.client.execute(
			"SELECT workspace_id, account_id, category_id, CAST(amount_minor AS TEXT) AS amount_minor, merchant FROM ledger_transaction WHERE id = 'transaction-1'"
		);
		assert.deepEqual(transaction.rows[0], {
			workspace_id: workspaceId,
			account_id: 'account-1',
			category_id: 'category-1',
			amount_minor: '9007199254740993',
			merchant: null
		});
		const correction = await connection.client.execute(
			"SELECT account_id, amount_minor FROM ledger_balance_correction WHERE id = 'correction-1'"
		);
		assert.deepEqual(correction.rows[0], {
			account_id: 'account-1',
			amount_minor: '-9876543210987'
		});
		const balanceCheck = await connection.client.execute(
			"SELECT account_id, observed_balance_minor FROM ledger_balance_check WHERE id = 'check-1'"
		);
		assert.deepEqual(balanceCheck.rows[0], {
			account_id: 'account-1',
			observed_balance_minor: 1234567890123
		});
		assert.deepEqual((await connection.client.execute('PRAGMA integrity_check')).rows, [
			{ integrity_check: 'ok' }
		]);
		assert.deepEqual((await connection.client.execute('PRAGMA foreign_key_check')).rows, []);

		const beforeReapply = await connection.client.execute(
			'SELECT COUNT(*) AS count, MAX(hash) AS latest_hash FROM __drizzle_migrations'
		);
		await migrate(connection.db, { migrationsFolder });
		const afterReapply = await connection.client.execute(
			'SELECT COUNT(*) AS count, MAX(hash) AS latest_hash FROM __drizzle_migrations'
		);
		assert.deepEqual(afterReapply.rows, beforeReapply.rows);
	} finally {
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
