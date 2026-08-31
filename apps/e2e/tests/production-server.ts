import { serve } from '@hono/node-server';
import { fileURLToPath } from 'node:url';

import { createServerApp } from '../../server/src/create-server-app';

const app = createServerApp({
	api: {
		fetch: () => Response.json(null)
	},
	dashboardDirectory: fileURLToPath(new URL('../../dashboard/build', import.meta.url)),
	profileImageOrigin: new URL(process.env.PROFILE_IMAGE_PUBLIC_BASE_URL!).origin,
	isProduction: true
});

const server = serve({ fetch: app.fetch, port: 4174 });
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
