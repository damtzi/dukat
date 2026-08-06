import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { financialAccount, ledgerBalanceCorrection, user, workspace } from '../schema';
import { createLedgerRepository } from './ledger';
import { createPlanningRepository } from './planning';

test('planning persists recurrence, forecasts corrections, and matches only once', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-planning-'));
	const url = `file:${join(directory, 'planning.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db
			.insert(user)
			.values({ id: 'planner', name: 'Planner', email: 'planner@example.com' });
		const [personal] = await connection.db
			.select({ id: workspace.id })
			.from(workspace)
			.where(eq(workspace.personalOwnerUserId, 'planner'));
		assert.ok(personal);
		const context = { userId: 'planner', workspaceId: personal.id };
		await financial.db.insert(financialAccount).values({
			id: 'cash',
			workspaceId: personal.id,
			name: 'Cash',
			type: 'cash',
			currency: 'PLN',
			openingBalanceMinor: 1000n
		});
		await financial.db.insert(ledgerBalanceCorrection).values({
			id: 'correction',
			workspaceId: personal.id,
			accountId: 'cash',
			date: '2026-01-01',
			amountMinor: '50'
		});

		const planning = createPlanningRepository(financial.db, () => new Date('2026-08-06T12:00:00Z'));
		const plan = await planning.create(context, {
			idempotencyKey: 'create-monthly-plan',
			accountId: 'cash',
			kind: 'expense',
			amountMinor: '100',
			date: '2026-01-31',
			status: 'expected',
			recurrence: { frequency: 'monthly', interval: 1 }
		});
		assert.deepEqual(
			await planning.create(context, {
				idempotencyKey: 'create-monthly-plan',
				accountId: 'cash',
				kind: 'expense',
				amountMinor: '100',
				date: '2026-01-31',
				status: 'expected',
				recurrence: { frequency: 'monthly', interval: 1 }
			}),
			plan
		);
		assert.equal(plan.recurrence?.frequency, 'monthly');
		const beforeMatch = await planning.accountForecast(context, 'cash');
		assert.equal(beforeMatch.startingBalanceMinor, '1050');
		assert.equal(beforeMatch.occurrences[0]?.date, '2026-08-06');

		const ledger = createLedgerRepository(financial.db);
		const transaction = await ledger.createTransaction(context, 'cash', {
			idempotencyKey: 'real-payment',
			kind: 'expense',
			amountMinor: '120',
			date: '2026-01-31'
		});
		const suggestions = await planning.suggestions(context, plan.id, '2026-01-31');
		assert.equal(suggestions[0]?.transaction.id, transaction.transaction.id);
		const matched = await planning.match(context, plan.id, '2026-01-31', {
			idempotencyKey: 'match-payment',
			version: plan.version,
			transactionId: transaction.transaction.id
		});
		assert.equal(matched.amountMismatch, true);
		assert.deepEqual(
			await planning.match(context, plan.id, '2026-01-31', {
				idempotencyKey: 'match-payment',
				version: plan.version,
				transactionId: transaction.transaction.id
			}),
			matched
		);
		await assert.rejects(
			() =>
				planning.match(context, plan.id, '2026-01-31', {
					idempotencyKey: 'match-payment-again',
					version: plan.version,
					transactionId: transaction.transaction.id
				}),
			/version conflict/i
		);
		const afterMatch = await planning.accountForecast(context, 'cash');
		assert.equal(afterMatch.matchedOccurrences[0]?.transaction.id, transaction.transaction.id);
		assert.equal(afterMatch.matchedOccurrences[0]?.occurrence.originalDate, '2026-01-31');
		assert.equal(
			BigInt(afterMatch.endingBalanceMinor) - BigInt(beforeMatch.endingBalanceMinor),
			-20n,
			'current real expense replaces the matched planned amount'
		);
		const futureTransaction = await ledger.createTransaction(context, 'cash', {
			idempotencyKey: 'future-real-payment',
			kind: 'expense',
			amountMinor: '100',
			date: '2026-10-31'
		});
		await planning.match(context, plan.id, '2026-10-31', {
			idempotencyKey: 'future-match',
			version: plan.version + 1,
			transactionId: futureTransaction.transaction.id
		});
		await planning.occurrenceAction(context, plan.id, '2026-11-30', 'skip', {
			idempotencyKey: 'future-skip',
			version: plan.version + 2
		});
		const successor = await planning.update(context, plan.id, {
			idempotencyKey: 'split-monthly-plan',
			version: plan.version + 3,
			effectiveFrom: '2026-10-31',
			amountMinor: '200'
		});
		assert.notEqual(successor.id, plan.id);
		assert.equal(successor.rootPlanId, plan.id);
		const afterSplit = await planning.accountForecast(context, 'cash');
		assert.ok(
			afterSplit.matchedOccurrences.some(
				(matchedOccurrence) =>
					matchedOccurrence.occurrence.originalDate === '2026-10-31' &&
					matchedOccurrence.occurrence.planId === successor.id
			)
		);
		assert.equal(
			afterSplit.occurrences.some((occurrence) => occurrence.originalDate === '2026-11-30'),
			false
		);
		assert.ok(
			afterSplit.occurrences.some(
				(occurrence) => occurrence.planId === successor.id && occurrence.amountMinor === '200'
			)
		);
		await planning.unmatch(context, plan.id, '2026-01-31', {
			idempotencyKey: 'unmatch-payment',
			version: plan.version + 4
		});
		assert.deepEqual(
			await planning.unmatch(context, plan.id, '2026-01-31', {
				idempotencyKey: 'unmatch-payment',
				version: plan.version + 4
			}),
			{ unmatched: true, version: plan.version + 5 }
		);
		assert.equal(
			(await planning.accountForecast(context, 'cash')).occurrences[0]?.date,
			'2026-08-06'
		);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
