import type { MiddlewareHandler } from 'hono';

import type { AppBindings } from '../lib/types';

const attempts = new Map<string, { count: number; resetsAt: number }>();

export function rateLimit(
	name: string,
	max: number,
	windowSeconds: number
): MiddlewareHandler<AppBindings> {
	return async (c, next) => {
		const now = Date.now();
		const client = c.var.userId || c.req.header('cf-connecting-ip') || 'unknown';
		const key = `${name}:${client}`;
		const current = attempts.get(key);
		const entry =
			!current || current.resetsAt <= now
				? { count: 1, resetsAt: now + windowSeconds * 1000 }
				: { ...current, count: current.count + 1 };
		attempts.set(key, entry);
		c.header('x-ratelimit-limit', String(max));
		c.header('x-ratelimit-remaining', String(Math.max(0, max - entry.count)));
		if (entry.count > max) {
			c.header('retry-after', String(Math.ceil((entry.resetsAt - now) / 1000)));
			return c.json({ message: 'Too many requests' }, 429);
		}
		await next();
	};
}
