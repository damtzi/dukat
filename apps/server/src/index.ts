import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApi } from '@dukat/api';
import { createAuth, createResendEmailSender } from '@dukat/auth';
import { createDatabase, initializeDatabase } from '@dukat/db';
import { authEnv } from '@dukat/env/auth';
import { dbEnv } from '@dukat/env/db';
import { serverEnv } from '@dukat/env/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pino from 'pino';

const logger = pino({ level: serverEnv.LOG_LEVEL });
const database = await initializeDatabase(
	createDatabase({
		url: dbEnv.DATABASE_URL,
		authToken: dbEnv.DATABASE_AUTH_TOKEN
	})
);
const emailSender = createResendEmailSender({
	apiKey: authEnv.RESEND_API_KEY,
	from: authEnv.AUTH_EMAIL_FROM
});
const auth = createAuth({
	database,
	baseURL: authEnv.BETTER_AUTH_URL,
	secret: authEnv.BETTER_AUTH_SECRET,
	emailSender,
	environment: serverEnv.NODE_ENV,
	trustedOrigins: [authEnv.CORS_ORIGIN].filter((origin): origin is string => Boolean(origin))
});
const app = createApi({ auth, database, logger });
const assetsRoot = resolve(process.cwd(), serverEnv.DASHBOARD_ASSETS_DIR);

app.all('/api/*', (context) => context.json({ message: 'Not found' }, 404));
app.use('*', serveStatic({ root: assetsRoot }));
app.get('*', async (context) => {
	try {
		return context.html(await readFile(resolve(assetsRoot, 'index.html'), 'utf8'));
	} catch {
		return context.json({ message: 'Dashboard assets are unavailable' }, 503);
	}
});

serve(
	{
		fetch: app.fetch,
		port: serverEnv.PORT
	},
	(info) => {
		logger.info({ event: 'server_started', port: info.port });
	}
);
