import { createClient, type Config } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

const DEFAULT_BUSY_TIMEOUT_MS = 1_000;

export function createDatabase(config: Config) {
	const client = createClient({ timeout: DEFAULT_BUSY_TIMEOUT_MS, ...config });
	return {
		client,
		db: drizzle(client, { schema })
	};
}

export type Database = ReturnType<typeof createDatabase>['db'];
