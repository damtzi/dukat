import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ReasonPhrases, StatusCodes } from 'http-status-codes';
import { LedgerError } from '@dukat/db/repositories/ledger';
import { WorkspaceError } from '@dukat/db/repositories/workspaces';

const onError: ErrorHandler = (err, c) => {
	const applicationError = err instanceof WorkspaceError || err instanceof LedgerError;
	const applicationCode = applicationError ? err.code : undefined;
	const currentStatus = 'status' in err ? err.status : c.newResponse(null).status;
	const statusCode =
		applicationCode === 'not_found'
			? StatusCodes.NOT_FOUND
			: applicationCode === 'conflict'
				? StatusCodes.CONFLICT
				: applicationCode === 'invalid'
					? StatusCodes.BAD_REQUEST
					: currentStatus !== StatusCodes.OK
						? (currentStatus as ContentfulStatusCode)
						: StatusCodes.INTERNAL_SERVER_ERROR;

	const env = c.env?.NODE_ENV || process.env?.NODE_ENV;
	const expected = applicationError || statusCode < StatusCodes.INTERNAL_SERVER_ERROR;

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
