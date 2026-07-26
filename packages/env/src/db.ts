import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export const dbEnv = createEnv({
	server: {
		TURSO_DATABASE_URL: z.string().min(1),
		TURSO_AUTH_TOKEN: z.string().min(1).optional()
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true
});
