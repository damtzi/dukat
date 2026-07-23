import { type Database } from '@dukat/db';
import * as schema from '@dukat/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import type { AuthEmailSender } from './email';

export const authMessages = {
	passwordResetSubject: 'Reset your Dukat password',
	passwordResetText: (url: string) => `Use this link to reset your Dukat password: ${url}`,
	emailVerificationSubject: 'Verify your Dukat email address',
	emailVerificationText: (url: string) => `Use this link to verify your Dukat email address: ${url}`
} as const;

export interface CreateAuthOptions {
	database: Database;
	baseURL: string;
	secret: string;
	emailSender: AuthEmailSender;
	environment: 'development' | 'test' | 'production';
	trustedOrigins?: string[];
	sessionExpiresIn?: number;
}

export function createAuth(options: CreateAuthOptions) {
	return betterAuth({
		database: drizzleAdapter(options.database, {
			provider: 'sqlite',
			schema,
			usePlural: false,
			transaction: true
		}),
		baseURL: options.baseURL,
		secret: options.secret,
		trustedOrigins: options.trustedOrigins ?? [],
		logger: { disabled: true },
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			sendResetPassword: async ({ user, url, token }) => {
				await options.emailSender.send({
					kind: 'password-reset',
					to: user.email,
					subject: authMessages.passwordResetSubject,
					text: authMessages.passwordResetText(url),
					url,
					token
				});
			}
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: false,
			sendVerificationEmail: async ({ user, url, token }) => {
				await options.emailSender.send({
					kind: 'email-verification',
					to: user.email,
					subject: authMessages.emailVerificationSubject,
					text: authMessages.emailVerificationText(url),
					url,
					token
				});
			}
		},
		session: {
			expiresIn: options.sessionExpiresIn ?? 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24
		},
		advanced: {
			defaultCookieAttributes: {
				sameSite: 'lax',
				secure: options.environment === 'production',
				httpOnly: true
			}
		}
	});
}

export type Auth = ReturnType<typeof createAuth>;
export * from './email';
