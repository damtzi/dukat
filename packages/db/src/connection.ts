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

declare const financialDatabaseBrand: unique symbol;
export type FinancialDatabase = Database & { readonly [financialDatabaseBrand]: true };

/** A separate client is required because libSQL's integer mode is client-global. */
export function createFinancialDatabase(config: Config) {
	const client = createClient({ timeout: DEFAULT_BUSY_TIMEOUT_MS, ...config, intMode: 'bigint' });
	return {
		client,
		db: drizzle(client, { schema }) as FinancialDatabase
	};
}
