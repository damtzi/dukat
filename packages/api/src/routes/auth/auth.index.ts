import { createRouter } from '../../lib/create-app';

export const authRouter = createRouter();

authRouter.on(['GET', 'POST'], '/auth/*', (c) => c.var.services.auth.handler(c.req.raw));
