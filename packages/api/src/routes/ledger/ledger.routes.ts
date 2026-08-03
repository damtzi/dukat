import { createRoute, z } from '@hono/zod-openapi';
import {
	accountSchema,
	balanceCheckSchema,
	createAccountSchema,
	createBalanceCheckSchema,
	createBalanceCorrectionSchema,
	createTransferSchema,
	createTransactionSchema,
	correctionSchema,
	historyEntrySchema,
	minorUnitsSchema,
	transactionSchema,
	transferSchema,
	updateAccountSchema,
	updateBalanceCheckSchema,
	updateTransactionSchema,
	updateTransferSchema,
	versionedMutationSchema
} from '@dukat/core/ledger';
import { jsonContent } from '../../openapi/helpers';

const id = z.string().min(1);
const params = z.object({ workspaceId: id });
const accountParams = params.extend({ accountId: id });
const transactionParams = params.extend({ transactionId: id });
const transferParams = params.extend({ transferId: id });
const reconciliationParams = params.extend({ entityId: id });
const transactionMutationSchema = z.object({
	transaction: transactionSchema,
	balanceMinor: minorUnitsSchema,
	negativeBalance: z.boolean()
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
	responses: responses(z.array(historyEntrySchema), 'Transaction history')
});
export const accountHistory = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/history',
	request: { params: accountParams },
	responses: responses(z.array(historyEntrySchema), 'Account history')
});
export const listTransfers = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/transfers',
	request: {
		params: accountParams,
		query: z.object({ includeTrashed: z.enum(['true', 'false']).optional() })
	},
	responses: responses(z.array(transferSchema), 'Transfers')
});
export const createTransfer = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/transfers',
	request: { params, body: jsonContent(createTransferSchema, 'Transfer') },
	responses: responses(transferSchema, 'Created transfer')
});
export const updateTransfer = createRoute({
	...common(),
	method: 'put',
	path: '/workspaces/{workspaceId}/transfers/{transferId}',
	request: { params: transferParams, body: jsonContent(updateTransferSchema, 'Transfer') },
	responses: responses(transferSchema, 'Updated transfer')
});
export const transferAction = <A extends 'trash' | 'restore'>(action: A) =>
	createRoute({
		...common(),
		method: 'post',
		path: `/workspaces/{workspaceId}/transfers/{transferId}/${action}` as `/workspaces/{workspaceId}/transfers/{transferId}/${A}`,
		request: { params: transferParams, body: jsonContent(versionedMutationSchema, action) },
		responses: responses(transferSchema, `${action} transfer`)
	});
export const transferHistory = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/transfers/{transferId}/history',
	request: { params: transferParams },
	responses: responses(z.array(historyEntrySchema), 'Transfer history')
});
export const createBalanceCheck = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/balance-checks',
	request: { params, body: jsonContent(createBalanceCheckSchema, 'Balance check') },
	responses: responses(balanceCheckSchema, 'Created balance check')
});
export const listBalanceChecks = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/balance-checks',
	request: {
		params: accountParams,
		query: z.object({ includeTrashed: z.enum(['true', 'false']).optional() })
	},
	responses: responses(z.array(balanceCheckSchema), 'Balance checks')
});
export const updateBalanceCheck = createRoute({
	...common(),
	method: 'put',
	path: '/workspaces/{workspaceId}/balance-checks/{entityId}',
	request: {
		params: reconciliationParams,
		body: jsonContent(updateBalanceCheckSchema, 'Balance check')
	},
	responses: responses(balanceCheckSchema, 'Updated balance check')
});
export const listCorrections = createRoute({
	...common(),
	method: 'get',
	path: '/workspaces/{workspaceId}/accounts/{accountId}/corrections',
	request: {
		params: accountParams,
		query: z.object({ includeTrashed: z.enum(['true', 'false']).optional() })
	},
	responses: responses(z.array(correctionSchema), 'Corrections')
});
export const createCorrection = createRoute({
	...common(),
	method: 'post',
	path: '/workspaces/{workspaceId}/corrections',
	request: { params, body: jsonContent(createBalanceCorrectionSchema, 'Correction') },
	responses: responses(correctionSchema, 'Created correction')
});
export const reconciliationAction = <
	E extends 'balance-checks' | 'corrections',
	A extends 'trash' | 'restore'
>(
	entity: E,
	action: A
) =>
	createRoute({
		...common(),
		method: 'post',
		path: `/workspaces/{workspaceId}/${entity}/{entityId}/${action}` as `/workspaces/{workspaceId}/${E}/{entityId}/${A}`,
		request: { params: reconciliationParams, body: jsonContent(versionedMutationSchema, action) },
		responses: responses(
			entity === 'balance-checks' ? balanceCheckSchema : correctionSchema,
			`${action} reconciliation`
		)
	});
export const reconciliationHistory = <E extends 'balance-checks' | 'corrections'>(entity: E) =>
	createRoute({
		...common(),
		method: 'get',
		path: `/workspaces/{workspaceId}/${entity}/{entityId}/history` as `/workspaces/{workspaceId}/${E}/{entityId}/history`,
		request: { params: reconciliationParams },
		responses: responses(z.array(historyEntrySchema), 'Reconciliation history')
	});
