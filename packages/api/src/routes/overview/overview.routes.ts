import { createRoute, z } from '@hono/zod-openapi';
import { myOverviewSchema } from '@dukat/core/overview';

import { jsonContent } from '../../openapi/helpers';

export const getOverview = createRoute({
	method: 'get',
	path: '/overview',
	tags: ['Overview'],
	security: [{ sessionCookie: [] }],
	responses: {
		200: jsonContent(myOverviewSchema, 'Private overview for the authenticated user'),
		401: jsonContent(z.object({ message: z.string() }), 'Authentication required')
	}
});
