import { createDatabase, migrateDatabase } from '../index';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const database = createDatabase({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
await migrateDatabase(database);
process.stdout.write(`${JSON.stringify({ event: 'database_migration_completed' })}\n`);
