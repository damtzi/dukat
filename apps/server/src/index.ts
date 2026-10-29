import { serve } from '@hono/node-server';
import { serverEnv } from '@dukat/env/server';

import { app } from './app';

const server = serve(
	{
		fetch: app.fetch,
		port: serverEnv.PORT
	},
	(info) => {
		console.log(JSON.stringify({ level: 'info', event: 'server.started', port: info.port }));
	}
);

let shuttingDown = false;
const shutdown = () => {
	if (shuttingDown) return;
	shuttingDown = true;
	server.close(() => process.exit(0));
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
