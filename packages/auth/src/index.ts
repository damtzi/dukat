import { db } from '@dukat/db';
import { authEnv } from '@dukat/env/auth';
import { serverEnv } from '@dukat/env/server';

import { createAuth } from './create-auth';
import { createResendEmailSender } from './email';

export { createAuth, type Auth } from './create-auth';
export * from './email';

export const emailSender = createResendEmailSender(authEnv.RESEND_API_KEY, authEnv.AUTH_EMAIL_FROM);
export const auth = createAuth({
	database: db,
	trustedOrigins: [authEnv.CORS_ORIGIN].filter((origin): origin is string => Boolean(origin)),
	emailSender,
	secret: authEnv.BETTER_AUTH_SECRET,
	baseURL: authEnv.BETTER_AUTH_URL,
	isProduction: serverEnv.NODE_ENV === 'production'
});
