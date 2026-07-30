import { serve } from '@hono/node-server';
import { serverEnv } from '@dukat/env/server';

import { app } from './app';

serve(
	{
		fetch: app.fetch,
		port: serverEnv.PORT
	},
	(info) => {
		console.log(JSON.stringify({ level: 'info', event: 'server.started', port: info.port }));
	}
);
