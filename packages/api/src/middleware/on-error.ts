import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';

const onError: ErrorHandler = (err, c) => {
	const currentStatus = 'status' in err ? err.status : c.newResponse(null).status;
	const statusCode =
		currentStatus !== StatusCodes.OK
			? (currentStatus as ContentfulStatusCode)
			: StatusCodes.INTERNAL_SERVER_ERROR;

	const env = c.env?.NODE_ENV || process.env?.NODE_ENV;
	const expected = statusCode < StatusCodes.INTERNAL_SERVER_ERROR;

	return c.json(
		{
			message:
				env === 'production' && !expected ? ReasonPhrases.INTERNAL_SERVER_ERROR : err.message,
			stack: env === 'production' ? undefined : err.stack
		},
		statusCode
	);
};

export default onError;
