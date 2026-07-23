import { checkDatabase, createDatabase } from '../index';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const database = createDatabase({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
const integrity = await checkDatabase(database);
process.stdout.write(
	`${JSON.stringify({ event: 'database_integrity_check', status: integrity.ok ? 'ok' : 'failed' })}\n`
);
if (!integrity.ok) process.exitCode = 1;
