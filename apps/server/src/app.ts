import { createAPI } from '@dukat/api';
import { auth } from '@dukat/auth';
import { db } from '@dukat/db';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { serverEnv } from '@dukat/env/server';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';

const api = createAPI({
	auth,
	readiness: () => db.run('select 1'),
	workspaces: createWorkspaceRepository(db)
});

export const app = createServerApp({
	api,
	dashboardDirectory: resolveDashboardDirectory(serverEnv.DASHBOARD_DIRECTORY, {
		production: serverEnv.NODE_ENV === 'production'
	})
});
