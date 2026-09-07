import { createRouter } from '../../lib/create-app';
import { authenticated } from '../../middleware/authenticated';
import * as handlers from './workspaces.handlers';
import * as routes from './workspaces.routes';
import { rateLimit } from '../../middleware/rate-limit';

const router = createRouter();
router.use('/workspaces/*', authenticated);
router.use('/workspace-invitations/*', authenticated);
router.use('/account/*', authenticated);
router.use('/account/delete', rateLimit('account-delete', 3, 3600));

export const workspacesRouter = router
	.openapi(routes.list, handlers.list)
	.openapi(routes.recoverable, handlers.recoverable)
	.openapi(routes.create, handlers.create)
	.openapi(routes.settings, handlers.settings)
	.openapi(routes.members, handlers.members)
	.openapi(routes.invitations, handlers.invitations)
	.openapi(routes.invite, handlers.invite)
	.openapi(routes.revoke, handlers.revoke)
	.openapi(routes.resend, handlers.resend)
	.openapi(routes.accept, handlers.accept)
	.openapi(routes.memberAction, handlers.memberAction)
	.openapi(routes.leave, handlers.leave)
	.openapi(routes.remove, handlers.remove)
	.openapi(routes.restore, handlers.restore)
	.openapi(routes.deletionPreflight, handlers.deletionPreflight)
	.openapi(routes.deleteAccount, handlers.deleteAccount)
	.openapi(routes.getOne, handlers.getOne);
