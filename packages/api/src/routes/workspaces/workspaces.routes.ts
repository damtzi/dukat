import { createRoute, z } from '@hono/zod-openapi';
import { legacyCurrencySchema, supportedCurrencySchema } from '@dukat/core/exchange-rates';

import { jsonContent } from '../../openapi/helpers';

const workspaceSummarySchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(['personal', 'household']),
	reportingCurrency: z.string().nullable(),
	version: z.number().int(),
	role: z.enum(['owner', 'member']).nullable()
});
const householdMemberSchema = z.object({
	userId: z.string(),
	name: z.string(),
	username: z.string(),
	image: z.string().nullable(),
	role: z.enum(['owner', 'member']),
	joinedAt: z.iso.datetime()
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

const params = z.object({ workspaceId: z.string().min(1) });
const version = z.object({ version: z.number().int().positive() });
const common = {
	tags,
	security: [{ sessionCookie: [] }],
	responses: {
		200: jsonContent(z.any(), 'Success'),
		400: jsonContent(messageSchema, 'Invalid request'),
		401: jsonContent(messageSchema, 'Authentication required'),
		404: jsonContent(messageSchema, 'Not found'),
		409: jsonContent(messageSchema, 'Conflict')
	}
};
export const create = createRoute({
	...common,
	method: 'post',
	path: '/workspaces',
	request: {
		body: jsonContent(
			z.object({
				name: z.string().trim().min(1),
				reportingCurrency: supportedCurrencySchema
			}),
			'Household'
		)
	}
});
export const settings = createRoute({
	...common,
	method: 'patch',
	path: '/workspaces/{workspaceId}',
	request: {
		params,
		body: jsonContent(
			version.extend({
				name: z.string().trim().min(1).optional(),
				reportingCurrency: legacyCurrencySchema.optional()
			}),
			'Settings'
		)
	}
});
export const members = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/members',
	request: { params },
	responses: {
		...common.responses,
		200: jsonContent(z.array(householdMemberSchema), 'Household members')
	}
});
export const invitations = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/{workspaceId}/invitations',
	request: { params }
});
export const invite = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/invitations',
	request: { params, body: jsonContent(version.extend({ email: z.email() }), 'Invitation') }
});
const invitationParams = params.extend({ id: z.string().min(1) });
export const revoke = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/invitations/{id}/revoke',
	request: { params: invitationParams, body: jsonContent(version, 'Version') }
});
export const resend = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/invitations/{id}/resend',
	request: { params: invitationParams, body: jsonContent(version, 'Version') }
});
export const accept = createRoute({
	...common,
	method: 'post',
	path: '/workspace-invitations/{token}/accept',
	request: { params: z.object({ token: z.string().min(1) }) }
});
const memberParams = params.extend({
	userId: z.string().min(1),
	action: z.enum(['promote', 'demote', 'remove'])
});
export const memberAction = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/members/{userId}/{action}',
	request: { params: memberParams, body: jsonContent(version, 'Version') }
});
export const leave = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/leave',
	request: { params, body: jsonContent(version, 'Version') }
});
export const remove = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/delete',
	request: {
		params,
		body: jsonContent(
			version.extend({
				password: z.string().min(1),
				confirmation: z.string().min(1),
				idempotencyKey: z.string().min(1)
			}),
			'Confirmation'
		)
	}
});
export const recoverable = createRoute({
	...common,
	method: 'get',
	path: '/workspaces/recoverable'
});
export const restore = createRoute({
	...common,
	method: 'post',
	path: '/workspaces/{workspaceId}/restore',
	request: { params, body: jsonContent(version, 'Version') }
});
export const deletionPreflight = createRoute({
	...common,
	method: 'get',
	path: '/account/deletion-preflight'
});
export const deleteAccount = createRoute({
	...common,
	method: 'post',
	path: '/account/delete',
	request: {
		body: jsonContent(
			z.object({ password: z.string().min(1), confirmation: z.literal('DELETE') }),
			'Account deletion confirmation'
		)
	}
});
