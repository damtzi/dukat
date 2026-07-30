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

export function sanitizeRequestPath(path: string) {
	return path.replace(/^(\/api\/auth\/reset-password)\/[^/]+/, '$1/:token');
}

export const requestLogger = structuredLogger({
	createLogger: (c) => rootLogger.child({ requestId: c.var.requestId }),
	onRequest(logger, c) {
		logger.info({ method: c.req.method, path: sanitizeRequestPath(c.req.path) }, 'request start');
	},
	onResponse(logger, c, elapsedMs) {
		logger.info(
			{
				method: c.req.method,
				path: sanitizeRequestPath(c.req.path),
				status: c.res.status,
				elapsedMs
			},
			'request end'
		);
	},
	onError(logger, error, c) {
		logger.error(
			{
				errorName: error.name,
				method: c.req.method,
				path: sanitizeRequestPath(c.req.path),
				status: c.res.status
			},
			'request error'
		);
	}
});
