import { createAPI } from '@dukat/api';
import { auth } from '@dukat/auth';
import { db, financialDb } from '@dukat/db';
import { createWorkspaceRepository } from '@dukat/db/repositories/workspaces';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { serverEnv } from '@dukat/env/server';

import { createServerApp, resolveDashboardDirectory } from './create-server-app';

const api = createAPI({
	auth,
	ledger: createLedgerRepository(financialDb),
	readiness: () => db.run('select 1'),
	workspaces: createWorkspaceRepository(db)
});

export const app = createServerApp({
	api,
	dashboardDirectory: resolveDashboardDirectory(serverEnv.DASHBOARD_DIRECTORY, {
		production: serverEnv.NODE_ENV === 'production'
	})
});
