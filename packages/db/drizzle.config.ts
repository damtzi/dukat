import { dbEnv } from '@dukat/env/db';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema',
	out: './src/migrations',
	dialect: 'turso',
	dbCredentials: {
		url: dbEnv.TURSO_DATABASE_URL,
		authToken: dbEnv.TURSO_AUTH_TOKEN
	}
});
