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
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx
} from 'better-auth/api';

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
	function validName(value: string) {
		const name = normalizeName(value);
		const message = nameValidationMessage(name);
		if (message) throw new APIError('BAD_REQUEST', { message });
		return name;
	}

	function validUsername(value: string) {
		const username = normalizeUsername(value);
		const message = usernameValidationMessage(username);
		if (message) throw new APIError('BAD_REQUEST', { message });
		return username;
	}

	async function usernameAvailability(value: string, currentUserId?: string) {
		const username = normalizeUsername(value);
		const validationMessage = usernameValidationMessage(username);
		if (validationMessage) return { available: false, username, message: validationMessage };

		const existing = await options.database
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.username, username))
			.limit(1);
		return {
			available: existing.length === 0 || existing[0].id === currentUserId,
			username,
			message:
				existing.length === 0 || existing[0].id === currentUserId
					? 'Username is available.'
					: 'That username is already taken.'
		};
	}

	const profileIdentityPlugin = {
		id: 'profile-identity',
		endpoints: {
			usernameAvailability: createAuthEndpoint(
				'/username-availability',
				{ method: 'GET' },
				async (ctx) => {
					const currentSession = await getSessionFromCtx(ctx);
					const username = ctx.request
						? (new URL(ctx.request.url).searchParams.get('username') ?? '')
						: '';
					ctx.setHeader('cache-control', 'no-store');
					return ctx.json(await usernameAvailability(username, currentSession?.user.id));
				}
			)
		},
		rateLimit: [
			{
				pathMatcher: (path: string) => path === '/username-availability',
				window: 60,
				max: 30
			}
		]
	};

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
		plugins: [profileIdentityPlugin],
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/update-user') return;
				if ('image' in ctx.body) {
					throw new APIError('BAD_REQUEST', {
						message: 'Use the profile image controls to change your image.'
					});
				}
				if (typeof ctx.body.name === 'string') {
					ctx.body.name = validName(ctx.body.name);
				}
				if (typeof ctx.body.username === 'string') {
					const username = validUsername(ctx.body.username);
					const currentSession = await getSessionFromCtx(ctx);
					const availability = await usernameAvailability(username, currentSession?.user.id);
					if (!availability.available)
						throw new APIError('CONFLICT', { message: availability.message });
					ctx.body.username = username;
				}
			})
		},
		databaseHooks: {
			user: {
				create: {
					async before(user) {
						const input = user as typeof user & { username?: unknown };
						const name = validName(user.name);
						const username = validUsername(
							typeof input.username === 'string' ? input.username : ''
						);
						return { data: { ...user, name, username } };
					}
				},
				update: {
					async before(user) {
						const input = user as typeof user & { name?: unknown; username?: unknown };
						const data = { ...user } as typeof user & { name?: string; username?: string };
						if (typeof input.name === 'string') {
							data.name = validName(input.name);
						}
						if (typeof input.username === 'string') {
							data.username = validUsername(input.username);
						}
						return { data };
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
		rateLimit: {
			enabled: options.isProduction ?? false,
			customRules: {
				'/update-user': { window: 60, max: 10 }
			}
		},
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
		async setProfileImage(userId: string, image: string | null) {
			await options.database.update(schema.user).set({ image }).where(eq(schema.user.id, userId));
		},
		async handler(request: Request) {
			const pathname = new URL(request.url).pathname;
			const isIdentityWrite =
				pathname.endsWith('/sign-up/email') || pathname.endsWith('/update-user');
			const identityBody = isIdentityWrite
				? request
						.clone()
						.json()
						.catch(() => undefined)
				: undefined;
			const response = await handler(request);
			if (response.ok || !identityBody) return response;

			const body = (await identityBody) as { username?: unknown } | undefined;
			if (typeof body?.username !== 'string') return response;
			const currentSession = pathname.endsWith('/update-user')
				? await auth.api.getSession({ headers: request.headers })
				: null;
			const availability = await usernameAvailability(body.username, currentSession?.user.id);
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
