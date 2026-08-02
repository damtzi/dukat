import { createRoute, z } from '@hono/zod-openapi';
import {
	createAccountSchema,
	createTransactionSchema,
	minorUnitsSchema,
	positiveMinorUnitsSchema,
	updateAccountSchema,
	updateTransactionSchema,
	versionedMutationSchema
} from '@dukat/core/ledger';
import { jsonContent } from '../../openapi/helpers';

const id = z.string().min(1);
const params = z.object({ workspaceId: id });
const accountParams = params.extend({ accountId: id });
const transactionParams = params.extend({ transactionId: id });
const nullableDate = z.string().nullable();
const accountSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	name: z.string(),
	type: z.enum(['current', 'savings', 'cash']),
	currency: z.string(),
	openingBalanceMinor: minorUnitsSchema,
	version: z.number().int(),
	activityStartedAt: nullableDate,
	archivedAt: nullableDate,
	createdAt: z.string(),
	updatedAt: z.string(),
	balanceMinor: minorUnitsSchema,
	negativeBalance: z.boolean(),
	canDelete: z.boolean(),
	canArchive: z.boolean(),
	canRestore: z.boolean()
});
const transactionSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	accountId: z.string(),
	kind: z.enum(['income', 'expense']),
	amountMinor: positiveMinorUnitsSchema,
	date: z.string(),
	description: z.string().nullable(),
	source: z.literal('manual'),
	version: z.number().int(),
	trashedAt: nullableDate,
	createdAt: z.string(),
	updatedAt: z.string()
});
const transactionMutationSchema = z.object({
	transaction: transactionSchema,
	balanceMinor: minorUnitsSchema,
	negativeBalance: z.boolean()
});
const auditSchema = z.object({
	id: z.string(),
	workspaceId: z.string(),
	actorUserId: z.string(),
	entityType: z.enum(['transaction', 'account']),
	entityId: z.string(),
	action: z.string(),
	beforeJson: z.string().nullable(),
	afterJson: z.string().nullable(),
	createdAt: z.string()
});
const messageSchema = z.object({ message: z.string() });
const responses = (schema: z.ZodType, description: string) => ({
	200: jsonContent(schema, description),
	400: jsonContent(messageSchema, 'Invalid request'),
	401: jsonContent(messageSchema, 'Authentication required'),
	404: jsonContent(messageSchema, 'Not found'),
	409: jsonContent(messageSchema, 'Conflict')
});
const common = () => ({ tags: ['Ledger'], security: [{ sessionCookie: [] }] });

export const listAccounts = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts',
	request: { params },
	responses: responses(z.array(accountSchema), 'Accounts')
});
export const createAccount = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/accounts',
	request: { params, body: jsonContent(createAccountSchema, 'Account') },
	responses: responses(accountSchema, 'Created account')
});
export const updateAccount = createRoute({
	...common(),
	method: 'put',
	path: '/workspaces/{workspaceId}/accounts/{accountId}',
	request: { params: accountParams, body: jsonContent(updateAccountSchema, 'Account') },
	responses: responses(accountSchema, 'Updated account')
});
export const accountAction = <A extends 'delete' | 'archive' | 'restore'>(action: A) =>
	createRoute({
		...common(),
		method: 'post',
		path: `/workspaces/{workspaceId}/accounts/{accountId}/${action}` as `/workspaces/{workspaceId}/accounts/{accountId}/${A}`,
		request: { params: accountParams, body: jsonContent(versionedMutationSchema, action) },
		responses: responses(
			action === 'delete'
				? z.object({ deleted: z.literal(true), negativeBalance: z.literal(false) })
				: accountSchema,
			`${action} account`
		)
	});
export const listTransactions = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/transactions',
	request: {
		params: accountParams,
		query: z.object({ includeTrashed: z.enum(['true', 'false']).optional() })
	},
	responses: responses(z.array(transactionSchema), 'Transactions')
});
export const createTransaction = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/transactions',
	request: { params: accountParams, body: jsonContent(createTransactionSchema, 'Transaction') },
	responses: responses(transactionMutationSchema, 'Created transaction')
});
export const updateTransaction = createRoute({
	...common(),
	method: 'put',
	path: '/workspaces/{workspaceId}/transactions/{transactionId}',
	request: { params: transactionParams, body: jsonContent(updateTransactionSchema, 'Transaction') },
	responses: responses(transactionMutationSchema, 'Updated transaction')
});
export const transactionAction = <A extends 'trash' | 'restore'>(action: A) =>
	createRoute({
		...common(),
		method: 'post',
		path: `/workspaces/{workspaceId}/transactions/{transactionId}/${action}` as `/workspaces/{workspaceId}/transactions/{transactionId}/${A}`,
		request: { params: transactionParams, body: jsonContent(versionedMutationSchema, action) },
		responses: responses(transactionMutationSchema, `${action} transaction`)
	});
export const transactionHistory = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/transactions/{transactionId}/history',
	request: { params: transactionParams },
	responses: responses(z.array(auditSchema), 'Transaction history')
});
export const accountHistory = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/history',
	request: { params: accountParams },
	responses: responses(z.array(auditSchema), 'Account history')
});
