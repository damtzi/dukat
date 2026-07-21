import { structuredLogger } from '@hono/structured-logger';
import { serverEnv } from '@dukat/env/server';
import pino from 'pino';
import pretty from 'pino-pretty';

const rootLogger = pino(
	{
		level: serverEnv.LOG_LEVEL
	},
	serverEnv.NODE_ENV === 'production' ? undefined : pretty()
);

const pinoLogger = structuredLogger({
	createLogger: (c) => rootLogger.child({ requestId: c.var.requestId })
});

export default pinoLogger;
