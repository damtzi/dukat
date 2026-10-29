import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export function createServerEnv(runtimeEnv: Record<string, string | undefined> = process.env) {
	return createEnv({
		server: {
			NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
			LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
			PORT: z.coerce.number().default(9999),
			DASHBOARD_DIRECTORY: z.string().min(1).default('../dashboard/build')
		},
		runtimeEnv,
		emptyStringAsUndefined: true,
		onValidationError(issues) {
			const variables = [...new Set(issues.map((issue) => String(issue.path?.[0] ?? 'unknown')))];
			throw new Error(`Invalid server environment: ${variables.join(', ')}`);
		}
	});
}

export const serverEnv = createServerEnv();
