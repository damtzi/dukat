import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import { loadDotenv } from './load-dotenv';

loadDotenv();

export const serverEnv = createEnv({
	server: {
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
		PORT: z.coerce.number().default(3000),
		DASHBOARD_ASSETS_DIR: z.string().default('../dashboard/build')
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true
});
