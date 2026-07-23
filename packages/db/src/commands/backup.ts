import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createDatabase, createEncryptedBackup } from '../index';

const url = process.env.DATABASE_URL;
const key = process.env.BACKUP_ENCRYPTION_KEY;
const output =
	process.env.BACKUP_PATH ?? `backups/dukat-${new Date().toISOString().slice(0, 10)}.backup`;
if (!url) throw new Error('DATABASE_URL is required');
if (!key) throw new Error('BACKUP_ENCRYPTION_KEY is required');

const database = createDatabase({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const backup = await createEncryptedBackup(database, key);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, backup, { mode: 0o600 });
process.stdout.write(
	`${JSON.stringify({ event: 'database_backup_completed', path: output, bytes: backup.byteLength })}\n`
);
