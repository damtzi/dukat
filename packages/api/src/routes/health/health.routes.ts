import { createRoute, z } from '@hono/zod-openapi';

import { jsonContent } from '../../openapi/helpers';

const statusSchema = z.object({ status: z.literal('ok') });
const unavailableSchema = z.object({ status: z.literal('unavailable') });
const tags = ['Health'];

export const live = createRoute({
	method: 'get',
	path: '/health/live',
	tags,
	responses: {
		200: jsonContent(statusSchema, 'The process is running')
	}
});

export const ready = createRoute({
	method: 'get',
	path: '/health/ready',
	tags,
	responses: {
		200: jsonContent(statusSchema, 'The service is ready'),
		503: jsonContent(unavailableSchema, 'The service is unavailable')
	}
});

export type LiveRoute = typeof live;
export type ReadyRoute = typeof ready;
