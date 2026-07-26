import { db } from '@dukat/db';
import { authEnv } from '@dukat/env/auth';
import * as schema from '@dukat/db/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: schema
	}),
	trustedOrigins: [authEnv.CORS_ORIGIN].filter((origin): origin is string => Boolean(origin)),
	emailAndPassword: {
		enabled: true
	},
	secret: authEnv.BETTER_AUTH_SECRET,
	baseURL: authEnv.BETTER_AUTH_URL,
	advanced: {
		defaultCookieAttributes: {
			sameSite: 'none',
			secure: true,
			httpOnly: true
		}
	}
});
