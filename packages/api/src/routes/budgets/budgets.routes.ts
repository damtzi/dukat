import { createRoute, z } from '@hono/zod-openapi';
import {
	budgetMonthSchema,
	budgetReportSchema,
	budgetSchema,
	createBudgetSchema,
	removeBudgetSchema,
	updateBudgetSchema
} from '@dukat/core/budgets';

import { jsonContent } from '../../openapi/helpers';

const id = z.string().min(1);
const params = z.object({ workspaceId: id });
const budgetParams = params.extend({ budgetId: id });
const message = z.object({ message: z.string() });
const responses = (schema: z.ZodType, description: string) => ({
	200: jsonContent(schema, description),
	400: jsonContent(message, 'Invalid request'),
	401: jsonContent(message, 'Authentication required'),
	404: jsonContent(message, 'Not found'),
	409: jsonContent(message, 'Conflict')
});
const common = { tags: ['Budgets'], security: [{ sessionCookie: [] }] };

export const report = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/budgets',
	request: {
		params,
		query: z.object({
			month: budgetMonthSchema,
			includeTentative: z.enum(['true', 'false']).optional()
		})
	},
	responses: responses(z.array(budgetReportSchema), 'Monthly category budgets')
});
export const createBudget = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/budgets',
	request: { params, body: jsonContent(createBudgetSchema, 'Budget') },
	responses: responses(budgetSchema, 'Created budget')
});
export const updateBudget = createRoute({
	...common,
	method: 'put',
	path: '/workspaces/{workspaceId}/budgets/{budgetId}',
	request: { params: budgetParams, body: jsonContent(updateBudgetSchema, 'Budget') },
	responses: responses(budgetSchema, 'Updated budget')
});
export const removeBudget = createRoute({
	...common,
	method: 'delete',
	path: '/workspaces/{workspaceId}/budgets/{budgetId}',
	request: { params: budgetParams, body: jsonContent(removeBudgetSchema, 'Budget version') },
	responses: responses(z.object({ removed: z.literal(true) }), 'Removed budget')
});
