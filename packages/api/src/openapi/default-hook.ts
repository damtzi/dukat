import type { Hook } from '@hono/zod-openapi';
import { StatusCodes } from 'http-status-codes';

const defaultHook: Hook<any, any, any, any> = (result, c) => {
	if (!result.success) {
		return c.json(
			{
				message: result.error.issues[0]?.message ?? 'Invalid request'
			},
			StatusCodes.BAD_REQUEST
		);
	}
};

export default defaultHook;
