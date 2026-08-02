import { dbEnv } from '@dukat/env/db';

import { createDatabase, createFinancialDatabase } from './connection';

export {
	createDatabase,
	createFinancialDatabase,
	type Database,
	type FinancialDatabase
} from './connection';

const connection = createDatabase({
	url: dbEnv.TURSO_DATABASE_URL,
	authToken: dbEnv.TURSO_AUTH_TOKEN
});

export const client = connection.client;
export const db = connection.db;

const financialConnection = createFinancialDatabase({
	url: dbEnv.TURSO_DATABASE_URL,
	authToken: dbEnv.TURSO_AUTH_TOKEN
});
export const financialClient = financialConnection.client;
export const financialDb = financialConnection.db;
