import { createAPI } from '@dukat/api';
import { auth } from '@dukat/auth';
import { db } from '@dukat/db';
import { serverEnv } from '@dukat/env/server';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';

const api = createAPI(
	{
		auth,
		readiness: () => db.run('select 1')
	},
	{ logLevel: serverEnv.LOG_LEVEL }
);

export const app = createServerApp({
	api,
	dashboardDirectory: resolveDashboardDirectory(serverEnv.DASHBOARD_DIRECTORY, {
		production: serverEnv.NODE_ENV === 'production'
	}),
	isProduction: serverEnv.NODE_ENV === 'production'
});
