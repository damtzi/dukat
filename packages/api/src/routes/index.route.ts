import { createRouter } from '../lib/create-app';
import { createRoute } from '@hono/zod-openapi';
import { jsonContent } from '../openapi/helpers';
import { createMessageObjectSchema } from '../openapi/schemas';

const router = createRouter().openapi(
	createRoute({
		tags: ['Index'],
		method: 'get',
		path: '/',
		responses: {
			200: jsonContent(createMessageObjectSchema('Template API'), 'Template API index')
		}
	}),
	(c) => {
		return c.json({ message: 'Hello from the template API!' }, 200);
	}
);

export default router;
