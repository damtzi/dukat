import { createRoute, z } from '@hono/zod-openapi';

import { jsonContent } from '../../openapi/helpers';

const workspaceSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(['personal', 'household'])
});
const messageSchema = z.object({ message: z.string() });
const tags = ['Workspaces'];

export const list = createRoute({
	method: 'get',
	path: '/workspaces',
	tags,
	security: [{ sessionCookie: [] }],
	responses: {
		200: jsonContent(z.array(workspaceSummarySchema), 'Accessible workspaces'),
		401: jsonContent(messageSchema, 'Authentication required')
	}
});

export const getOne = createRoute({
	method: 'get',
	path: '/workspaces/{workspaceId}',
	tags,
	security: [{ sessionCookie: [] }],
	request: {
		params: z.object({ workspaceId: z.string().min(1) })
	},
	responses: {
		200: jsonContent(workspaceSummarySchema, 'Workspace'),
		401: jsonContent(messageSchema, 'Authentication required'),
		404: jsonContent(messageSchema, 'Workspace unavailable')
	}
});

export type ListRoute = typeof list;
export type GetOneRoute = typeof getOne;
