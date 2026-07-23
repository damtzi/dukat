import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { fileURLToPath } from 'node:url';

import * as schema from './schema';

export interface DatabaseConfig {
	url: string;
	authToken?: string;
}

export function createDatabase(config: DatabaseConfig) {
	const client = createClient({ url: config.url, authToken: config.authToken });
	return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;

export async function initializeDatabase(database: Database) {
	await database.$client.execute('PRAGMA foreign_keys = ON');
	return database;
}

export async function migrateDatabase(
	database: Database,
	migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url))
) {
	await initializeDatabase(database);
	await migrate(database, { migrationsFolder });
}

export { checkDatabaseIntegrity as checkDatabase } from './recovery';
export * from './recovery';
export * from './schema';
