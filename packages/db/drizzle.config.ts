import { dbEnv } from '@dukat/env/db';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema',
	out: './src/migrations',
	dialect: 'postgresql',
	dbCredentials: {
		url: dbEnv.DATABASE_URL
	}
});
