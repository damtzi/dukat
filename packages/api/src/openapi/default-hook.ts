import type { Hook } from '@hono/zod-openapi';
import { StatusCodes } from 'http-status-codes';

const defaultHook: Hook<any, any, any, any> = (result, c) => {
	if (!result.success) {
		return c.json(
			{
				success: result.success,
				error: {
					name: result.error.name,
					issues: result.error.issues
				}
			},
			StatusCodes.UNPROCESSABLE_ENTITY
		);
	}
};

export default defaultHook;
