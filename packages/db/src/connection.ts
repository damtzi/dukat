import { createClient, type Config } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import * as schema from './schema';

export function createDatabase(config: Config) {
	const client = createClient(config);
	return {
		client,
		db: drizzle(client, { schema })
	};
}

export type Database = ReturnType<typeof createDatabase>['db'];
