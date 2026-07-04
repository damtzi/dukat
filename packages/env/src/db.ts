import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export const dbEnv = createEnv({
	server: {
		DATABASE_URL: z.url()
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true
});
