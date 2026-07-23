import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/schema',
	out: './src/migrations',
	dialect: 'turso',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'file:../../data/dukat.db',
		authToken: process.env.DATABASE_AUTH_TOKEN
	}
});
