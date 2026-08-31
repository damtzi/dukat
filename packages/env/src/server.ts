import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export const serverEnv = createEnv({
	server: {
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
		PORT: z.coerce.number().default(9999),
		DASHBOARD_DIRECTORY: z.string().min(1).default('../dashboard/build'),
		PROFILE_IMAGE_DIRECTORY: z.string().min(1).default('./data/profile-images')
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true
});
