import { createRoute, z } from '@hono/zod-openapi';
import {
	cashFlowInputSchema,
	cashFlowSchema,
	categoryActionSchema,
	categoryActionInputSchema,
	categorySchema,
	createCategoryInputSchema,
	confirmInputSchema,
	importBatchSchema,
	importDetailSchema,
	previewInputSchema,
	previewSchema,
	summaryInputSchema,
	summarySchema,
	trashImportInputSchema,
	updateCategoryInputSchema
} from '@dukat/core';

import { jsonContent } from '../../openapi/helpers';

const id = z.string().min(1);
const params = z.object({ workspaceId: id });
const categoryParams = params.extend({ categoryId: id });
const importParams = params.extend({ importId: id });
const message = z.object({ message: z.string() });
const responses = (schema: z.ZodType, description: string) => ({
	200: jsonContent(schema, description),
	400: jsonContent(message, 'Invalid request'),
	401: jsonContent(message, 'Authentication required'),
	404: jsonContent(message, 'Not found'),
	409: jsonContent(message, 'Conflict')
});
const common = () => ({ tags: ['Insights'], security: [{ sessionCookie: [] }] });

export const listCategories = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/categories',
	request: { params },
	responses: responses(z.array(categorySchema), 'Categories')
});
export const createCategory = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/categories',
	request: { params, body: jsonContent(createCategoryInputSchema, 'Category') },
	responses: responses(categorySchema, 'Category')
});
export const updateCategory = createRoute({
	...common(),
	method: 'put',
	path: '/workspaces/{workspaceId}/categories/{categoryId}',
	request: {
		params: categoryParams,
		body: jsonContent(updateCategoryInputSchema, 'Category')
	},
	responses: responses(categorySchema, 'Category')
});
export const categoryAction = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/categories/{categoryId}/{action}',
	request: {
		params: categoryParams.extend({ action: categoryActionSchema }),
		body: jsonContent(categoryActionInputSchema, 'Category action')
	},
	responses: responses(z.object({ id, action: categoryActionSchema }), 'Category action')
});
export const summary = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/summary',
	request: { params, query: summaryInputSchema },
	responses: responses(summarySchema, 'Summary')
});
export const cashFlow = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/cash-flow',
	request: { params, query: cashFlowInputSchema },
	responses: responses(cashFlowSchema, 'Cash flow')
});
export const preview = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/imports/preview',
	request: { params, body: jsonContent(previewInputSchema, 'CSV') },
	responses: responses(previewSchema, 'Preview')
});
export const confirm = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/imports/confirm',
	request: { params, body: jsonContent(confirmInputSchema, 'CSV confirmation') },
	responses: responses(importBatchSchema.extend({ count: z.number().int() }), 'Import')
});
export const listImports = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/imports',
	request: { params },
	responses: responses(z.array(importBatchSchema), 'Imports')
});
export const importDetail = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/imports/{importId}',
	request: { params: importParams },
	responses: responses(importDetailSchema, 'Import detail')
});
export const trashImport = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/imports/{importId}/trash',
	request: { params: importParams, body: jsonContent(trashImportInputSchema, 'Idempotency') },
	responses: responses(z.object({ trashed: z.number().int() }), 'Trashed import')
});
