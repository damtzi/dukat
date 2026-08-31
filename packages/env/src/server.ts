import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

const httpsUrl = z.url().refine((value) => value.startsWith('https://'), 'Must use HTTPS');
const httpsOrigin = httpsUrl.refine((value) => {
	try {
		const url = new URL(value);
		return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
	} catch {
		return false;
	}
}, 'Must be an HTTPS origin without credentials, a path, query, or fragment');
const serverShape = {
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
	PORT: z.coerce.number().default(9999),
	DASHBOARD_DIRECTORY: z.string().min(1).default('../dashboard/build'),
	PROFILE_IMAGE_DIRECTORY: z.string().min(1).default('./data/profile-images'),
	PROFILE_IMAGE_S3_ENDPOINT: httpsUrl.optional(),
	PROFILE_IMAGE_S3_REGION: z.string().min(1).optional(),
	PROFILE_IMAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
	PROFILE_IMAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
	PROFILE_IMAGE_S3_BUCKET: z
		.string()
		.regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Must be a valid S3 bucket name')
		.optional(),
	PROFILE_IMAGE_PUBLIC_BASE_URL: httpsOrigin.optional()
};

const productionProfileImageVariables = [
	'PROFILE_IMAGE_S3_ENDPOINT',
	'PROFILE_IMAGE_S3_REGION',
	'PROFILE_IMAGE_S3_ACCESS_KEY_ID',
	'PROFILE_IMAGE_S3_SECRET_ACCESS_KEY',
	'PROFILE_IMAGE_S3_BUCKET',
	'PROFILE_IMAGE_PUBLIC_BASE_URL'
] as const;

export function createServerEnv(runtimeEnv: Record<string, string | undefined> = process.env) {
	return createEnv({
		server: serverShape,
		createFinalSchema: (shape) =>
			z.object(shape).superRefine((environment, context) => {
				if (environment.NODE_ENV !== 'production') return;
				for (const variable of productionProfileImageVariables) {
					if (!environment[variable]) {
						context.addIssue({
							code: 'custom',
							path: [variable],
							message: 'Required in production'
						});
					}
				}
			}),
		runtimeEnv,
		emptyStringAsUndefined: true,
		onValidationError(issues) {
			const variables = [...new Set(issues.map((issue) => String(issue.path?.[0] ?? 'unknown')))];
			throw new Error(`Invalid server environment: ${variables.join(', ')}`);
		}
	});
}

export const serverEnv = createServerEnv();
