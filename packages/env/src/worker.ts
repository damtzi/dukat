import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const httpsOrigin = z.url().refine((value) => {
	const url = new URL(value);
	return (
		url.protocol === 'https:' &&
		!url.username &&
		!url.password &&
		url.pathname === '/' &&
		!url.search &&
		!url.hash
	);
}, 'Must be an HTTPS origin without credentials, a path, query, or fragment');

export function createWorkerEnv(runtimeEnv: Record<string, string | undefined>) {
	return createEnv({
		server: {
			NODE_ENV: z.literal('production'),
			LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
			BETTER_AUTH_SECRET: z.string().min(32),
			BETTER_AUTH_URL: httpsOrigin,
			TURSO_DATABASE_URL: z
				.string()
				.refine(
					(value) => value.startsWith('libsql://') || value.startsWith('https://'),
					'Must be a remote Turso URL'
				),
			TURSO_AUTH_TOKEN: z.string().min(1),
			RESEND_API_KEY: z.string().min(1),
			AUTH_EMAIL_FROM: z.string().min(1)
		},
		runtimeEnv,
		emptyStringAsUndefined: true,
		onValidationError(issues) {
			const variables = [...new Set(issues.map((issue) => String(issue.path?.[0] ?? 'unknown')))];
			throw new Error(`Invalid Worker environment: ${variables.join(', ')}`);
		}
	});
}
