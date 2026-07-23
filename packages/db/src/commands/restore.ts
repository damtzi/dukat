import { readFile } from 'node:fs/promises';

import { checkDatabase, createDatabase, migrateDatabase, restoreEncryptedBackup } from '../index';

const url = process.env.RESTORE_DATABASE_URL;
const key = process.env.BACKUP_ENCRYPTION_KEY;
const input = process.env.BACKUP_PATH;
if (!url) throw new Error('RESTORE_DATABASE_URL is required; restore only into a new database');
if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is required');
if (!input) throw new Error('BACKUP_PATH is required');

const database = createDatabase({ url, authToken: process.env.RESTORE_DATABASE_AUTH_TOKEN });
await migrateDatabase(database);
await restoreEncryptedBackup(database, await readFile(input), key);
const integrity = await checkDatabase(database);
if (!integrity.ok) throw new Error('Restored database failed integrity checks');
process.stdout.write(
	`${JSON.stringify({ event: 'database_restore_completed', integrity: 'ok' })}\n`
);
