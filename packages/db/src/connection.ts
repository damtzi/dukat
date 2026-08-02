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

declare const financialDatabaseBrand: unique symbol;
export type FinancialDatabase = Database & { readonly [financialDatabaseBrand]: true };

/** A separate client is required because libSQL's integer mode is client-global. */
export function createFinancialDatabase(config: Config) {
	const client = createClient({ ...config, intMode: 'bigint' });
	return {
		client,
		db: drizzle(client, { schema }) as FinancialDatabase
	};
}
