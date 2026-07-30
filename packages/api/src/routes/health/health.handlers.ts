import type { AppRouteHandler } from '../../lib/types';
import type { LiveRoute, ReadyRoute } from './health.routes';

export const live: AppRouteHandler<LiveRoute> = (c) => c.json({ status: 'ok' }, 200);

export const ready: AppRouteHandler<ReadyRoute> = async (c) => {
	try {
		await c.var.services.readiness();
		return c.json({ status: 'ok' }, 200);
	} catch (error) {
		c.var.logger.error(
			{ errorName: error instanceof Error ? error.name : 'UnknownError' },
			'Readiness check failed'
		);
		return c.json({ status: 'unavailable' }, 503);
	}
};
