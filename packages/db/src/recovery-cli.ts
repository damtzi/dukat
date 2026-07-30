import { dbEnv } from '@dukat/env/db';

import { assertDatabaseIntegrity, backupDatabase, restoreDatabase } from './recovery';
import { client } from './index';

const [command, path] = process.argv.slice(2);
const key = process.env.BACKUP_ENCRYPTION_KEY;

if (command === 'integrity') {
	await assertDatabaseIntegrity(client);
	client.close();
	process.stdout.write(`${JSON.stringify({ level: 'info', event: 'database.integrity.ok' })}\n`);
} else if ((command === 'backup' || command === 'restore') && path && key) {
	if (command === 'backup') {
		await backupDatabase(dbEnv.TURSO_DATABASE_URL, dbEnv.TURSO_AUTH_TOKEN, path, key);
	} else {
		await restoreDatabase(dbEnv.TURSO_DATABASE_URL, dbEnv.TURSO_AUTH_TOKEN, path, key);
	}
	process.stdout.write(`${JSON.stringify({ level: 'info', event: `database.${command}.ok` })}\n`);
} else {
	throw new Error(
		'Usage: recovery-cli.ts integrity | (backup|restore) <path> with BACKUP_ENCRYPTION_KEY set'
	);
}
