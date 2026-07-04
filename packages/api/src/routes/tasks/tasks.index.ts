import { createRouter } from '../../lib/create-app';
import * as handler from './tasks.handlers';
import * as routes from './tasks.routes';

const router = createRouter().openapi(routes.list, handler.list);

export default router;
