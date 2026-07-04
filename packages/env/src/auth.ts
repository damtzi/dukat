import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export const authEnv = createEnv({
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url().optional()
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true
});
