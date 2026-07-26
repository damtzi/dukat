import { createClient } from '@libsql/client';
import { dbEnv } from '@dukat/env/db';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

const client = createClient({
	url: dbEnv.TURSO_DATABASE_URL,
	authToken: dbEnv.TURSO_AUTH_TOKEN
});

export const db = drizzle(client, { schema });
