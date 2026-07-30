import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

const backupFormat = 'dukat-backup-v1';

interface EncryptedBackup {
	format: typeof backupFormat;
	iv: string;
	tag: string;
	ciphertext: string;
}

function quoteIdentifier(identifier: string) {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteValue(value: InValue) {
	if (value === null) return 'NULL';
	if (typeof value === 'boolean') return value ? '1' : '0';
	if (typeof value === 'bigint' || typeof value === 'number') return String(value);
	if (value instanceof Date) return `'${value.toISOString()}'`;
	if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
	const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
	return `X'${Buffer.from(bytes).toString('hex')}'`;
}

function encryptionKey(encodedKey: string) {
	const key = Buffer.from(encodedKey, 'base64');
	if (key.length !== 32) {
		throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
	}
	return key;
}

export async function createLogicalBackup(client: Client) {
	const transaction = await client.transaction('read');
	let schemaResult: ResultSet;
	let tableRows: ResultSet[];
	let tables: string[];
	try {
		schemaResult = await transaction.execute({
			sql: `SELECT type, name, sql FROM sqlite_schema
				WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
				ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
			args: []
		});
		tables = schemaResult.rows.filter((row) => row.type === 'table').map((row) => String(row.name));
		tableRows = await transaction.batch(
			tables.map((table) => `SELECT * FROM ${quoteIdentifier(table)}`)
		);
		await transaction.commit();
	} catch (error) {
		if (!transaction.closed) await transaction.rollback();
		throw error;
	} finally {
		transaction.close();
	}
	const statements = ['PRAGMA foreign_keys=OFF', 'BEGIN'];

	for (const row of schemaResult.rows.filter((item) => item.type === 'table')) {
		statements.push(String(row.sql));
	}

	for (const [index, table] of tables.entries()) {
		const result = tableRows[index];
		for (const row of result.rows) {
			const columns = result.columns.map(quoteIdentifier).join(', ');
			const values = result.columns.map((column) => quoteValue(row[column])).join(', ');
			statements.push(`INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${values})`);
		}
	}

	for (const row of schemaResult.rows.filter((item) => item.type !== 'table')) {
		statements.push(String(row.sql));
	}

	statements.push('COMMIT', 'PRAGMA foreign_keys=ON');
	return `${statements.join(';\n')};\n`;
}

export async function writeEncryptedBackup(sql: string, outputPath: string, encodedKey: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
	const ciphertext = Buffer.concat([cipher.update(sql, 'utf8'), cipher.final()]);
	const backup: EncryptedBackup = {
		format: backupFormat,
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		ciphertext: ciphertext.toString('base64')
	};
	await writeFile(outputPath, `${JSON.stringify(backup)}\n`, { mode: 0o600 });
}

export async function readEncryptedBackup(inputPath: string, encodedKey: string) {
	const backup = JSON.parse(await readFile(inputPath, 'utf8')) as EncryptedBackup;
	if (backup.format !== backupFormat) throw new Error('Unsupported backup format');
	const decipher = createDecipheriv(
		'aes-256-gcm',
		encryptionKey(encodedKey),
		Buffer.from(backup.iv, 'base64')
	);
	decipher.setAuthTag(Buffer.from(backup.tag, 'base64'));
	return Buffer.concat([
		decipher.update(Buffer.from(backup.ciphertext, 'base64')),
		decipher.final()
	]).toString('utf8');
}

export async function assertDatabaseIntegrity(client: Client) {
	const integrity = await client.execute('PRAGMA integrity_check');
	if (integrity.rows.length !== 1 || integrity.rows[0].integrity_check !== 'ok') {
		throw new Error('SQLite integrity check failed');
	}
	const foreignKeys = await client.execute('PRAGMA foreign_key_check');
	if (foreignKeys.rows.length > 0) throw new Error('Foreign key check failed');
	const invalidPersonalWorkspaceCounts = await client.execute(`
		SELECT user.id
		FROM user
		LEFT JOIN workspace
			ON workspace.personal_owner_user_id = user.id
			AND workspace.type = 'personal'
		GROUP BY user.id
		HAVING COUNT(workspace.id) != 1
	`);
	if (invalidPersonalWorkspaceCounts.rows.length > 0) {
		throw new Error('Personal workspace ownership check failed');
	}
}

export async function backupDatabase(
	databaseUrl: string,
	authToken: string | undefined,
	outputPath: string,
	encodedKey: string
) {
	const client = createClient({ url: databaseUrl, authToken });
	try {
		await writeEncryptedBackup(await createLogicalBackup(client), outputPath, encodedKey);
	} finally {
		client.close();
	}
}

export async function restoreDatabase(
	databaseUrl: string,
	authToken: string | undefined,
	inputPath: string,
	encodedKey: string
) {
	const client = createClient({ url: databaseUrl, authToken });
	try {
		const existing = await client.execute(
			"SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
		);
		if (existing.rows.length > 0) throw new Error('Restore target database is not empty');
		await client.executeMultiple(await readEncryptedBackup(inputPath, encodedKey));
		await assertDatabaseIntegrity(client);
	} finally {
		client.close();
	}
}
