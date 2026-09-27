import { createRoute, z } from '@hono/zod-openapi';
import { createMortgageSchema, mortgageSchema } from '@dukat/core/mortgage';
import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import { jsonContent } from '../../openapi/helpers';

const params = z.object({ workspaceId: z.string().min(1) });
const message = z.object({ message: z.string() });
const result = mortgageSchema.extend({
	schedule: z.array(
		z.object({
			number: z.number(),
			date: z.string(),
			openingBalanceMinor: z.string(),
			principalMinor: z.string(),
			interestMinor: z.string(),
			paymentMinor: z.string(),
			closingBalanceMinor: z.string()
		})
	)
});
const responses = {
	200: jsonContent(result.nullable(), 'Mortgage details or no mortgage'),
	400: jsonContent(message, 'Invalid request'),
	401: jsonContent(message, 'Authentication required'),
	404: jsonContent(message, 'Not found'),
	409: jsonContent(message, 'Conflict')
};
const common = { tags: ['Mortgage'], security: [{ sessionCookie: [] }] };
const get = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/mortgage',
	request: { params },
	responses
});
const create = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/mortgage',
	request: { params, body: jsonContent(createMortgageSchema, 'Mortgage setup') },
	responses
});
const router = createRouter();
router.use('/workspaces/*', authenticated);
export const mortgageRouter = router
	.openapi(get, async (c) =>
		c.json(
			await c.var.services.mortgage!.get({
				userId: c.var.userId,
				workspaceId: c.req.valid('param').workspaceId
			}),
			200
		)
	)
	.openapi(create, async (c) =>
		c.json(
			await c.var.services.mortgage!.create(
				{ userId: c.var.userId, workspaceId: c.req.valid('param').workspaceId },
				c.req.valid('json')
			),
			200
		)
	);
