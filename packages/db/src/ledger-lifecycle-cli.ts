import { createLedgerRepository } from './repositories/ledger';
import { financialClient, financialDb } from './index';

const purged = await createLedgerRepository(financialDb).purgeLifecycle();
process.stdout.write(
	`${JSON.stringify({ level: 'info', event: 'ledger.lifecycle.purged', ...purged })}\n`
);
financialClient.close();
