import { createRoute, z } from '@hono/zod-openapi';

import { jsonContent } from '../../openapi/helpers';

const favoriteSchema = z.object({
	id: z.string(),
	path: z.string(),
	label: z.string()
});
const messageSchema = z.object({ message: z.string() });
const favoritePathSchema = z
	.string()
	.trim()
	.min(1)
	.max(512)
	.regex(/^\/(?!\/)[^\\?#]*$/, 'Must be an internal application path')
	.refine(
		(path) => !Array.from(path).some((character) => character.charCodeAt(0) <= 31),
		'Must be an internal application path'
	);
const tags = ['Favorites'];
const security = [{ sessionCookie: [] }];

export const list = createRoute({
	method: 'get',
	path: '/favorites',
	tags,
	security,
	responses: {
		200: jsonContent(z.array(favoriteSchema), 'Favorite pages'),
		401: jsonContent(messageSchema, 'Authentication required')
	}
});

export const create = createRoute({
	method: 'post',
	path: '/favorites',
	tags,
	security,
	request: {
		body: jsonContent(
			z.object({
				path: favoritePathSchema,
				label: z.string().trim().min(1).max(120)
			}),
			'Favorite page'
		)
	},
	responses: {
		201: jsonContent(favoriteSchema, 'Favorite saved'),
		400: jsonContent(messageSchema, 'Invalid request'),
		401: jsonContent(messageSchema, 'Authentication required')
	}
});

export const remove = createRoute({
	method: 'delete',
	path: '/favorites/{favoriteId}',
	tags,
	security,
	request: {
		params: z.object({ favoriteId: z.string().min(1) })
	},
	responses: {
		204: { description: 'Favorite removed' },
		401: jsonContent(messageSchema, 'Authentication required')
	}
});

export type ListRoute = typeof list;
export type CreateRoute = typeof create;
export type RemoveRoute = typeof remove;
