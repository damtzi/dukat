import { structuredLogger } from '@hono/structured-logger';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const weights: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
	fatal: 5
};

const write = (
	minimumLevel: LogLevel,
	level: 'debug' | 'info' | 'warn' | 'error',
	requestId: string,
	value: unknown,
	message?: string,
	...args: unknown[]
) => {
	if (weights[level] < weights[minimumLevel]) return;
	const details = value && typeof value === 'object' ? value : { value };
	const output = JSON.stringify({
		...details,
		...(message ? { message } : {}),
		...(args.length ? { args } : {}),
		level,
		requestId
	});
	globalThis.console[level](output);
};

const createLogger = (minimumLevel: LogLevel, requestId: string) => ({
	debug: (value: unknown, message?: string, ...args: unknown[]) =>
		write(minimumLevel, 'debug', requestId, value, message, ...args),
	info: (value: unknown, message?: string, ...args: unknown[]) =>
		write(minimumLevel, 'info', requestId, value, message, ...args),
	warn: (value: unknown, message?: string, ...args: unknown[]) =>
		write(minimumLevel, 'warn', requestId, value, message, ...args),
	error: (value: unknown, message?: string, ...args: unknown[]) =>
		write(minimumLevel, 'error', requestId, value, message, ...args)
});

export function sanitizeRequestPath(path: string) {
	return path
		.replace(/^(\/api\/auth\/reset-password)\/[^/]+/, '$1/:token')
		.replace(/^(\/api\/workspace-invitations)\/[^/]+(\/accept)$/, '$1/:token$2')
		.replace(/^(\/api\/admin\/users)\/[^/]+\//, '$1/:userId/')
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id');
}

export const createRequestLogger = (minimumLevel: LogLevel = 'info') =>
	structuredLogger({
		createLogger: (c) => createLogger(minimumLevel, c.var.requestId),
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
