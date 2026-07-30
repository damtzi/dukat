import type { Database } from '@dukat/db/connection';
import * as schema from '@dukat/db/schema/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { authEmailMessages, type TransactionalEmailSender } from './email';

export interface CreateAuthOptions {
	database: Database;
	baseURL: string;
	secret: string;
	emailSender: TransactionalEmailSender;
	trustedOrigins?: string[];
	isProduction?: boolean;
}

export function createAuth(options: CreateAuthOptions) {
	return betterAuth({
		database: drizzleAdapter(options.database, {
			provider: 'sqlite',
			schema
		}),
		basePath: '/api/auth',
		trustedOrigins: options.trustedOrigins ?? [],
		emailVerification: {
			sendOnSignUp: true,
			async sendVerificationEmail({ user, url }) {
				await options.emailSender.send({
					to: user.email,
					...authEmailMessages.verification(url)
				});
			}
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			async sendResetPassword({ user, url }) {
				await options.emailSender.send({
					to: user.email,
					...authEmailMessages.passwordReset(url)
				});
			}
		},
		logger: { disabled: true },
		secret: options.secret,
		baseURL: options.baseURL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: 'lax',
				secure: options.isProduction ?? false,
				httpOnly: true
			}
		}
	});
}

export type Auth = ReturnType<typeof createAuth>;
