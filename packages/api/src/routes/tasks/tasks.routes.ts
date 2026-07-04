import { createRoute, z } from '@hono/zod-openapi';
import { jsonContent } from '../../openapi/helpers';

const tags = ['Tasks'];

export const list = createRoute({
	method: 'get',
	path: '/tasks',
	tags,
	responses: {
		200: jsonContent(
			z.array(
				z.object({
					name: z.string(),
					done: z.boolean()
				})
			),
			'List of tasks'
		)
	}
});

export type ListRoute = typeof list;
