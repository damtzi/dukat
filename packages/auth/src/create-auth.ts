import type { Database } from '@dukat/db/connection';
import * as schema from '@dukat/db/schema/auth';
import {
	nameValidationMessage,
	normalizeName,
	normalizeUsername,
	usernameValidationMessage
} from '@dukat/core/identity';
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';

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
	async function usernameAvailability(value: string) {
		const username = normalizeUsername(value);
		const validationMessage = usernameValidationMessage(username);
		if (validationMessage) return { available: false, username, message: validationMessage };

		const existing = await options.database
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.username, username))
			.limit(1);
		return {
			available: existing.length === 0,
			username,
			message: existing.length === 0 ? 'Username is available.' : 'That username is already taken.'
		};
	}

	const auth = betterAuth({
		database: drizzleAdapter(options.database, {
			provider: 'sqlite',
			schema
		}),
		basePath: '/api/auth',
		trustedOrigins: options.trustedOrigins ?? [],
		user: {
			additionalFields: {
				username: { type: 'string', required: true, input: true, returned: true }
			}
		},
		databaseHooks: {
			user: {
				create: {
					async before(user) {
						const input = user as typeof user & { username?: unknown };
						const name = normalizeName(user.name);
						const username = normalizeUsername(
							typeof input.username === 'string' ? input.username : ''
						);
						const message = nameValidationMessage(name) ?? usernameValidationMessage(username);
						if (message) throw new APIError('BAD_REQUEST', { message });
						return { data: { ...user, name, username } };
					}
				}
			}
		},
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
	const handler = auth.handler;

	return Object.assign(auth, {
		usernameAvailability,
		async handler(request: Request) {
			const isSignup = new URL(request.url).pathname.endsWith('/sign-up/email');
			const signupBody = isSignup
				? request
						.clone()
						.json()
						.catch(() => undefined)
				: undefined;
			const response = await handler(request);
			if (response.ok || !signupBody) return response;

			const body = (await signupBody) as { username?: unknown } | undefined;
			if (typeof body?.username !== 'string') return response;
			const availability = await usernameAvailability(body.username);
			if (
				availability.username &&
				!availability.available &&
				!usernameValidationMessage(availability.username)
			) {
				return Response.json(
					{ code: 'USERNAME_UNAVAILABLE', message: 'That username is already taken.' },
					{ status: 409 }
				);
			}
			return response;
		}
	});
}

export type Auth = ReturnType<typeof createAuth>;
