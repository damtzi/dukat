import { dbEnv } from '@dukat/env/db';

import { createDatabase } from './connection';

export { createDatabase, type Database } from './connection';

const connection = createDatabase({
	url: dbEnv.TURSO_DATABASE_URL,
	authToken: dbEnv.TURSO_AUTH_TOKEN
});

export const client = connection.client;
export const db = connection.db;
