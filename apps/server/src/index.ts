import { serve } from '@hono/node-server';
import { app } from '@repo/api';
import { serverEnv } from '@repo/env/server';

serve(
	{
		fetch: app.fetch,
		port: serverEnv.PORT
	},
	(info) => {
		console.log(`Server is running on http://localhost:${info.port}`);
	}
);
