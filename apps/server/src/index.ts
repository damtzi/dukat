import { serve } from '@hono/node-server';
import { app } from '@dukat/api';
import { serverEnv } from '@dukat/env/server';

serve(
	{
		fetch: app.fetch,
		port: serverEnv.PORT
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	}
);
