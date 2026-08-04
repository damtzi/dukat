import { createLedgerRepository } from './repositories/ledger';
import { createWorkspaceRepository } from './repositories/workspaces';
import { db, financialClient, financialDb } from './index';

const ledger = await createLedgerRepository(financialDb).purgeLifecycle();
const households = await createWorkspaceRepository(db).purgeExpired();
process.stdout.write(
	`${JSON.stringify({ level: 'info', event: 'lifecycle.purged', ledger, households: households.length })}\n`
);
financialClient.close();
