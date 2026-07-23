import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { InValue, Row } from '@libsql/client';

import type { Database } from './index';

const backupMagic = Buffer.from('DUKAT1');

interface BackupTable {
	name: string;
	columns: string[];
	rows: unknown[][];
}

interface LogicalBackup {
	version: 1;
	createdAt: string;
	tables: BackupTable[];
}

function encryptionKey(encodedKey: string) {
	const key = Buffer.from(encodedKey, 'base64');
	if (key.length !== 32)
		throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
	return key;
}

function quoteIdentifier(identifier: string) {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function encodeValue(value: InValue): unknown {
	if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
	if (value instanceof ArrayBuffer) {
		return { $type: 'bytes', value: Buffer.from(value).toString('base64') };
	}
	if (value instanceof Uint8Array) {
		return { $type: 'bytes', value: Buffer.from(value).toString('base64') };
	}
	return value;
}

function decodeValue(value: unknown): InValue {
	if (typeof value === 'object' && value !== null && '$type' in value && 'value' in value) {
		const tagged = value as { $type: string; value: string };
		if (tagged.$type === 'bigint') return BigInt(tagged.value);
		if (tagged.$type === 'bytes') return Buffer.from(tagged.value, 'base64');
	}
	if (value === null || typeof value === 'string' || typeof value === 'number') return value;
	throw new Error('Backup contains an unsupported value');
}

export async function createEncryptedBackup(database: Database, encodedKey: string) {
	const transaction = await database.$client.transaction('read');
	const tables: BackupTable[] = [];
	try {
		const tableResult = await transaction.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name"
		);
		for (const tableRow of tableResult.rows) {
			const name = String(tableRow.name);
			const columnResult = await transaction.execute(`PRAGMA table_info(${quoteIdentifier(name)})`);
			const columns = columnResult.rows.map((column) => String(column.name));
			const data = await transaction.execute(`SELECT * FROM ${quoteIdentifier(name)}`);
			tables.push({
				name,
				columns,
				rows: data.rows.map((row: Row) => columns.map((column) => encodeValue(row[column] ?? null)))
			});
		}
		await transaction.commit();
	} finally {
		transaction.close();
	}

	const payload: LogicalBackup = {
		version: 1,
		createdAt: new Date().toISOString(),
		tables
	};
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(encodedKey), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(payload), 'utf8'),
		cipher.final()
	]);
	return Buffer.concat([backupMagic, iv, cipher.getAuthTag(), ciphertext]);
}

export async function restoreEncryptedBackup(
	database: Database,
	encryptedBackup: Uint8Array,
	encodedKey: string
) {
	const input = Buffer.from(encryptedBackup);
	if (!input.subarray(0, backupMagic.length).equals(backupMagic)) {
		throw new Error('Backup format is not recognized');
	}
	const ivStart = backupMagic.length;
	const tagStart = ivStart + 12;
	const ciphertextStart = tagStart + 16;
	const decipher = createDecipheriv(
		'aes-256-gcm',
		encryptionKey(encodedKey),
		input.subarray(ivStart, tagStart)
	);
	decipher.setAuthTag(input.subarray(tagStart, ciphertextStart));
	const plaintext = Buffer.concat([
		decipher.update(input.subarray(ciphertextStart)),
		decipher.final()
	]).toString('utf8');
	const backup = JSON.parse(plaintext) as LogicalBackup;
	if (backup.version !== 1 || !Array.isArray(backup.tables)) {
		throw new Error('Backup version is not supported');
	}

	for (const table of backup.tables) {
		const existing = await database.$client.execute(
			`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`
		);
		if (Number(existing.rows[0]?.count) !== 0) {
			throw new Error(`Restore target table ${table.name} is not empty`);
		}
	}

	await database.$client.execute('PRAGMA foreign_keys = OFF');
	try {
		for (const table of backup.tables) {
			if (table.name === 'workspace') {
				// The user-insert trigger provisions temporary personal workspaces during restore.
				// Replace them with the exact workspace records captured in the backup.
				await database.$client.execute('DELETE FROM workspace_member');
				await database.$client.execute('DELETE FROM workspace');
			}
			if (table.rows.length === 0) continue;
			const columns = table.columns.map(quoteIdentifier).join(', ');
			const placeholders = table.columns.map(() => '?').join(', ');
			for (const row of table.rows) {
				await database.$client.execute({
					sql: `INSERT INTO ${quoteIdentifier(table.name)} (${columns}) VALUES (${placeholders})`,
					args: row.map(decodeValue)
				});
			}
		}
	} finally {
		await database.$client.execute('PRAGMA foreign_keys = ON');
	}

	const integrity = await checkDatabaseIntegrity(database);
	if (!integrity.ok) throw new Error('Restored database failed its integrity check');
}

export async function checkDatabaseIntegrity(database: Database) {
	const quickCheck = await database.$client.execute('PRAGMA quick_check');
	const foreignKeys = await database.$client.execute('PRAGMA foreign_key_check');
	const personalWorkspaceCheck = await database.$client.execute(`
		SELECT COUNT(*) AS violations
		FROM workspace AS w
		WHERE w.type = 'personal'
		  AND (
			w.owner_user_id IS NULL
			OR (SELECT COUNT(*) FROM workspace_member AS m
				WHERE m.workspace_id = w.id AND m.user_id = w.owner_user_id AND m.role = 'owner') != 1
		  )
	`);
	const personalWorkspaceViolations = Number(personalWorkspaceCheck.rows[0]?.violations ?? 0);
	return {
		ok:
			quickCheck.rows[0]?.quick_check === 'ok' &&
			foreignKeys.rows.length === 0 &&
			personalWorkspaceViolations === 0,
		quickCheck: quickCheck.rows,
		foreignKeyViolations: foreignKeys.rows,
		personalWorkspaceViolations
	};
}
