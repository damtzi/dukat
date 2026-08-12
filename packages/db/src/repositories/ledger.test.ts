import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import {
	financialAccount,
	ledgerAudit,
	ledgerBalanceCorrection,
	ledgerTransaction,
	ledgerTransfer,
	mutationReceipt,
	plannedSeries,
	user,
	workspace,
	workspaceMembership
} from '../schema';
import { createLedgerRepository, LedgerError } from './ledger';
import { createPlanningRepository } from './planning';
import { assertDatabaseIntegrity } from '../recovery';

test('account archive preflight guards and atomically applies plan impact with audits', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-archive-impact-'));
	const url = `file:${join(directory, 'ledger.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db
			.insert(user)
			.values({ id: 'archive-owner', name: 'Owner', email: 'archive@example.com' });
		const [personal] = await connection.db
			.select()
			.from(workspace)
			.where(eq(workspace.personalOwnerUserId, 'archive-owner'));
		const context = { userId: 'archive-owner', workspaceId: personal.id };
		await financial.db.insert(financialAccount).values({
			id: 'archive-account',
			workspaceId: personal.id,
			name: 'Closing',
			type: 'cash',
			currency: 'PLN',
			openingBalanceMinor: 0n,
			activityStartedAt: new Date('2026-01-01T00:00:00Z')
		});
		await financial.db.insert(plannedSeries).values([
			{
				id: 'archive-recurring',
				rootPlanId: 'archive-recurring',
				workspaceId: personal.id,
				accountId: 'archive-account',
				kind: 'expense',
				amountMinor: 100n,
				date: '2026-01-01',
				effectiveFrom: '2026-01-01',
				status: 'expected',
				description: 'Rent',
				recurrenceFrequency: 'monthly',
				recurrenceInterval: 1
			},
			{
				id: 'archive-one-time',
				rootPlanId: 'archive-one-time',
				workspaceId: personal.id,
				accountId: 'archive-account',
				kind: 'income',
				amountMinor: 200n,
				date: '2999-01-01',
				effectiveFrom: '2999-01-01',
				status: 'tentative',
				description: 'Refund'
			},
			{
				id: 'archive-past',
				rootPlanId: 'archive-past',
				workspaceId: personal.id,
				accountId: 'archive-account',
				kind: 'expense',
				amountMinor: 50n,
				date: '2020-01-01',
				effectiveFrom: '2020-01-01',
				status: 'expected'
			}
		]);
		const ledger = createLedgerRepository(financial.db);
		const first = await ledger.accountArchiveImpact(context, 'archive-account');
		assert.deepEqual(
			first.plans.map((plan) => [plan.id, plan.action, plan.description]),
			[
				['archive-one-time', 'cancel', 'Refund'],
				['archive-past', 'cancel', null],
				['archive-recurring', 'stop', 'Rent']
			]
		);
		assert.equal(
			(await financial.db.select().from(plannedSeries)).every((plan) => plan.version === 1),
			true
		);
		await financial.db
			.update(plannedSeries)
			.set({ version: 2 })
			.where(eq(plannedSeries.id, 'archive-one-time'));
		await assert.rejects(
			() =>
				ledger.accountAction(context, 'archive-account', 'archive', {
					version: 1,
					idempotencyKey: 'stale-archive-impact',
					impactToken: first.impactToken
				}),
			(error) => error instanceof LedgerError && error.code === 'conflict'
		);
		assert.equal(
			(
				await financial.db
					.select()
					.from(financialAccount)
					.where(eq(financialAccount.id, 'archive-account'))
			)[0].archivedAt,
			null
		);
		const current = await ledger.accountArchiveImpact(context, 'archive-account');
		const archived = await ledger.accountAction(context, 'archive-account', 'archive', {
			version: 1,
			idempotencyKey: 'current-archive-impact',
			impactToken: current.impactToken
		});
		assert.ok('planningImpact' in archived);
		assert.deepEqual(archived.planningImpact, { stoppedRecurring: 1, cancelledOneTime: 2 });
		const plans = await financial.db.select().from(plannedSeries);
		assert.equal(plans.find((plan) => plan.id === 'archive-recurring')?.cutoffDate, current.date);
		assert.equal(plans.find((plan) => plan.id === 'archive-one-time')?.cancelled, 1);
		assert.equal(plans.find((plan) => plan.id === 'archive-past')?.cancelled, 1);
		const planAudits = (await financial.db.select().from(ledgerAudit)).filter(
			(entry) => entry.entityType === 'plan'
		);
		assert.deepEqual(planAudits.map((entry) => entry.action).sort(), ['cancel', 'cancel', 'stop']);
		assert.equal(
			planAudits.every((entry) => entry.actorUserId === 'archive-owner'),
			true
		);
		const planning = createPlanningRepository(financial.db);
		assert.deepEqual((await planning.accountForecast(context, 'archive-account')).occurrences, []);
		await assert.rejects(
			() =>
				planning.occurrenceAction(context, 'archive-recurring', '2026-01-01', 'restore', {
					version: 2,
					idempotencyKey: 'archived-plan-change'
				}),
			(error) => error instanceof Error && error.message.includes('Archived account')
		);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('cross-workspace transfers project private counterpart data and require access to both sides', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-cross-transfer-'));
	const url = `file:${join(directory, 'ledger.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{ id: 'cross-owner', name: 'Owner', email: 'cross-owner@example.com' },
			{ id: 'house-member', name: 'Member', email: 'member@example.com' }
		]);
		const [personal] = await connection.db
			.select()
			.from(workspace)
			.where(eq(workspace.personalOwnerUserId, 'cross-owner'));
		await connection.db
			.insert(workspace)
			.values({ id: 'cross-house', name: 'House', type: 'household' });
		await connection.db.insert(workspaceMembership).values([
			{ workspaceId: 'cross-house', userId: 'cross-owner', role: 'owner' },
			{ workspaceId: 'cross-house', userId: 'house-member', role: 'member' }
		]);
		await financial.db.insert(financialAccount).values([
			{
				id: 'private-account',
				workspaceId: personal.id,
				name: 'Secret personal account',
				type: 'cash',
				currency: 'EUR',
				openingBalanceMinor: 1000n
			},
			{
				id: 'house-account',
				workspaceId: 'cross-house',
				name: 'Shared',
				type: 'cash',
				currency: 'USD',
				openingBalanceMinor: 0n
			}
		]);
		const ledger = createLedgerRepository(financial.db);
		const created = await ledger.createTransfer(
			{ userId: 'cross-owner', workspaceId: 'cross-house' },
			{
				idempotencyKey: 'cross-create',
				fromAccountId: 'private-account',
				toAccountId: 'house-account',
				amountMinor: '250',
				receivedAmountMinor: '200',
				date: '2026-07-30'
			}
		);
		assert.equal(created.counterparty.visibility, 'full');
		assert.equal(created.canManage, true);
		const [limited] = await ledger.listTransfers(
			{ userId: 'house-member', workspaceId: 'cross-house' },
			'house-account'
		);
		assert.equal(limited.localSide, 'to');
		assert.equal(limited.amountMinor, '200');
		assert.equal(limited.sentAmountMinor, null);
		assert.equal(limited.receivedAmountMinor, '200');
		assert.deepEqual(limited.counterparty, { visibility: 'private' });
		assert.equal(limited.canManage, false);
		const serialized = JSON.stringify(limited);
		assert.ok(!serialized.includes('250'));
		assert.ok(!serialized.includes(personal.id));
		assert.ok(!serialized.includes('private-account'));
		assert.ok(!serialized.includes('Secret personal account'));
		await financial.db
			.update(ledgerTransfer)
			.set({ sentAmountMinor: 251n })
			.where(eq(ledgerTransfer.id, created.id));
		await assert.rejects(
			() =>
				ledger.listTransfers(
					{ userId: 'cross-owner', workspaceId: personal.id },
					'private-account'
				),
			/aggregates are corrupt/i
		);
		await assert.rejects(() => assertDatabaseIntegrity(financial.client), /canonical shape/i);
		await financial.db
			.update(ledgerTransfer)
			.set({ sentAmountMinor: 250n })
			.where(eq(ledgerTransfer.id, created.id));
		await assertDatabaseIntegrity(financial.client);
		await assert.rejects(
			() =>
				ledger.transferAction(
					{ userId: 'house-member', workspaceId: 'cross-house' },
					created.id,
					'trash',
					{ idempotencyKey: 'limited-trash', version: 1 }
				),
			(error) => error instanceof LedgerError && error.code === 'not_found'
		);

		await connection.db.delete(workspace).where(eq(workspace.id, 'cross-house'));
		const [detached] = await ledger.listTransfers(
			{ userId: 'cross-owner', workspaceId: personal.id },
			'private-account'
		);
		assert.equal(detached.localSide, 'from');
		assert.equal(detached.sentAmountMinor, '250');
		assert.equal(detached.receivedAmountMinor, null);
		assert.deepEqual(detached.counterparty, { visibility: 'deleted' });
		assert.equal(detached.canManage, false);
		assert.equal((await financial.db.select().from(ledgerTransfer)).length, 1);
		const survivingLegs = await financial.db
			.select()
			.from(ledgerTransaction)
			.where(eq(ledgerTransaction.transferId, created.id));
		assert.deepEqual(
			survivingLegs.map((leg) => [leg.workspaceId, leg.accountId, leg.transferSide]),
			[[personal.id, 'private-account', 'from']]
		);
		await assert.rejects(
			() =>
				ledger.updateTransfer({ userId: 'cross-owner', workspaceId: personal.id }, created.id, {
					idempotencyKey: 'detached-update',
					version: 1,
					toAccountId: 'house-account',
					amountMinor: '300',
					date: '2026-07-30'
				}),
			(error) => error instanceof LedgerError && error.code === 'conflict'
		);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test(
	'cross-client write locks return a bounded clear conflict without overwriting',
	{ timeout: 5_000 },
	async () => {
		const directory = await mkdtemp(join(tmpdir(), 'dukat-ledger-busy-'));
		const url = `file:${join(directory, 'ledger.db')}`;
		const connection = createDatabase({ url, timeout: 40 });
		const financial = createFinancialDatabase({ url, timeout: 40 });
		try {
			await migrate(connection.db, {
				migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
			});
			await connection.db
				.insert(user)
				.values({ id: 'busy-owner', name: 'Busy Owner', email: 'busy@example.com' });
			const [personal] = await connection.db
				.select()
				.from(workspace)
				.where(eq(workspace.personalOwnerUserId, 'busy-owner'));
			await financial.db.insert(financialAccount).values({
				id: 'busy-account',
				workspaceId: personal.id,
				name: 'Before',
				type: 'cash',
				currency: 'PLN',
				openingBalanceMinor: 0n
			});
			const ledger = createLedgerRepository(financial.db);
			const context = { userId: 'busy-owner', workspaceId: personal.id };

			const shortLockWorker = new Worker(
				`const { parentPort, workerData } = require('node:worker_threads');
			 void import('@libsql/client').then(async ({ createClient }) => {
			   const client = createClient({ url: workerData.url, timeout: 40, intMode: 'bigint' });
			   const transaction = await client.transaction('write');
			   await transaction.execute({
			     sql: 'UPDATE financial_account SET updated_at = updated_at WHERE id = ?',
			     args: ['busy-account']
			   });
			   parentPort.postMessage('locked');
			   parentPort.once('message', async (message) => {
			     if (message !== 'release') return;
			     await transaction.rollback();
			     transaction.close();
			     client.close();
			     parentPort.postMessage('released');
			   });
			 });`,
				{ eval: true, workerData: { url } }
			);
			await new Promise<void>((resolve, reject) => {
				shortLockWorker.once('message', (message) => {
					if (message === 'locked') resolve();
					else reject(new Error(`Unexpected worker message: ${String(message)}`));
				});
				shortLockWorker.once('error', reject);
			});
			const released = new Promise<void>((resolve, reject) => {
				shortLockWorker.once('message', (message) => {
					if (message === 'released') resolve();
					else reject(new Error(`Unexpected worker message: ${String(message)}`));
				});
				shortLockWorker.once('error', reject);
			});
			await assert.rejects(
				() =>
					ledger.updateAccount(context, 'busy-account', {
						idempotencyKey: 'busy-lock',
						version: 1,
						name: 'After wait',
						type: 'cash',
						currency: 'PLN',
						openingBalanceMinor: '0'
					}),
				(error) =>
					error instanceof LedgerError &&
					error.code === 'conflict' &&
					error.message === 'Database is busy; try the request again'
			);
			shortLockWorker.postMessage('release');
			await released;
			await shortLockWorker.terminate();
			const [unchanged] = await connection.db
				.select({ name: financialAccount.name, version: financialAccount.version })
				.from(financialAccount)
				.where(eq(financialAccount.id, 'busy-account'));
			assert.deepEqual(unchanged, { name: 'Before', version: 1 });
		} finally {
			financial.client.close();
			connection.client.close();
			await rm(directory, { recursive: true, force: true });
		}
	}
);

test('personal manual ledger balances, versions, idempotency, trash and audit lifecycle', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-ledger-'));
	const connection = createDatabase({ url: `file:${join(directory, 'ledger.db')}` });
	let financial: ReturnType<typeof createFinancialDatabase> | undefined;
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db
			.insert(user)
			.values({ id: 'owner', name: 'Owner', email: 'owner@example.com' });
		const workspaces = await connection.client.execute(
			"select id from workspace where personal_owner_user_id = 'owner'"
		);
		const context = { userId: 'owner', workspaceId: String(workspaces.rows[0].id) };
		financial = createFinancialDatabase({ url: `file:${join(directory, 'ledger.db')}` });
		const ledger = createLedgerRepository(financial.db);
		await financial.db.insert(financialAccount).values({
			id: 'legacy-account',
			workspaceId: context.workspaceId,
			name: 'Legacy',
			type: 'cash',
			currency: 'BGN',
			openingBalanceMinor: 0n
		});
		const legacy = await ledger.updateAccount(context, 'legacy-account', {
			idempotencyKey: 'rename-legacy-account',
			version: 1,
			name: 'Renamed legacy',
			type: 'cash',
			currency: 'BGN',
			openingBalanceMinor: '0'
		});
		assert.equal(legacy.name, 'Renamed legacy');
		const account = await ledger.createAccount(context, {
			idempotencyKey: 'create-account-1',
			name: 'Cash',
			type: 'cash',
			currency: 'EUR',
			openingBalanceMinor: '100'
		});
		const duplicate = await ledger.createAccount(context, {
			idempotencyKey: 'create-account-1',
			name: 'Cash',
			type: 'cash',
			currency: 'EUR',
			openingBalanceMinor: '100'
		});
		assert.equal(duplicate.id, account.id);
		await assert.rejects(
			() =>
				ledger.createAccount(context, {
					idempotencyKey: 'create-account-1',
					name: 'Different',
					type: 'cash',
					currency: 'EUR',
					openingBalanceMinor: '100'
				}),
			/different request/i
		);
		const expense = await ledger.createTransaction(context, account.id, {
			idempotencyKey: 'create-expense-1',
			kind: 'expense',
			amountMinor: '150',
			date: '2026-07-30'
		});
		assert.equal(expense.balanceMinor, '-50');
		assert.equal(expense.negativeBalance, true);
		await assert.rejects(
			() =>
				ledger.updateAccount(context, account.id, {
					idempotencyKey: 'stale-account-1',
					version: 99,
					name: 'Cash',
					type: 'cash',
					currency: 'EUR',
					openingBalanceMinor: '100'
				}),
			(error) => error instanceof LedgerError && error.code === 'conflict'
		);
		await assert.rejects(
			() =>
				ledger.updateAccount(context, account.id, {
					idempotencyKey: 'currency-change-1',
					version: 1,
					name: 'Cash',
					type: 'cash',
					currency: 'USD',
					openingBalanceMinor: '100'
				}),
			/currency is immutable/i
		);
		const concurrentUpdates = await Promise.allSettled([
			ledger.updateAccount(context, account.id, {
				idempotencyKey: 'concurrent-account-a',
				version: 1,
				name: 'Cash A',
				type: 'cash',
				currency: 'EUR',
				openingBalanceMinor: '100'
			}),
			ledger.updateAccount(context, account.id, {
				idempotencyKey: 'concurrent-account-b',
				version: 1,
				name: 'Cash B',
				type: 'cash',
				currency: 'EUR',
				openingBalanceMinor: '100'
			})
		]);
		assert.equal(
			concurrentUpdates.filter((result) => result.status === 'fulfilled').length,
			1,
			'only one concurrent stale write succeeds'
		);
		const rejectedUpdate = concurrentUpdates.find((result) => result.status === 'rejected');
		assert.ok(
			rejectedUpdate?.status === 'rejected' &&
				rejectedUpdate.reason instanceof LedgerError &&
				rejectedUpdate.reason.code === 'conflict',
			'the losing write returns a clear conflict'
		);
		const trashed = await ledger.transactionAction(context, expense.transaction.id, 'trash', {
			idempotencyKey: 'trash-expense-1',
			version: 1
		});
		assert.equal(trashed.balanceMinor, '100');
		const restored = await ledger.transactionAction(context, expense.transaction.id, 'restore', {
			idempotencyKey: 'restore-expense-1',
			version: 2
		});
		assert.equal(restored.balanceMinor, '-50');
		assert.equal((await ledger.history(context, 'transaction', expense.transaction.id)).length, 3);

		const trashedForPurge = await ledger.transactionAction(
			context,
			expense.transaction.id,
			'trash',
			{
				idempotencyKey: 'trash-expense-2',
				version: 3
			}
		);
		const cutoff = new Date('2026-07-31T12:00:00.000Z');
		await connection.db
			.update(ledgerTransaction)
			.set({ trashedAt: cutoff })
			.where(eq(ledgerTransaction.id, trashedForPurge.transaction.id));
		assert.equal(await ledger.purgeTrashed(cutoff), 0, 'trash at the cutoff remains restorable');
		await connection.db
			.update(ledgerTransaction)
			.set({ trashedAt: new Date(cutoff.getTime() - 1) })
			.where(eq(ledgerTransaction.id, trashedForPurge.transaction.id));
		const auditCountBeforePurge = (await financial.db.select().from(ledgerAudit)).length;
		assert.equal(await ledger.purgeTrashed(cutoff), 1, 'trash older than the cutoff is purged');
		assert.equal(
			(await financial.db.select().from(ledgerAudit)).length,
			auditCountBeforePurge,
			'system transaction purge preserves full user audit history and adds no purge audit'
		);
		await financial.db.update(mutationReceipt).set({ createdAt: new Date(cutoff.getTime() - 1) });
		const lifecycle = await ledger.purgeLifecycle(cutoff, cutoff);
		assert.equal(lifecycle.transactions, 0);
		assert.ok(
			lifecycle.idempotencyReceipts > 0,
			'expired 37-day receipts are independently purged'
		);

		const accountView = (await ledger.listAccounts(context)).find(
			(value) => value.id === account.id
		)!;
		assert.equal(accountView.canDelete, false);
		await assert.rejects(
			() =>
				ledger.accountAction(context, account.id, 'delete', {
					idempotencyKey: 'delete-used-account',
					version: accountView.version
				}),
			/only unused active accounts/i
		);
		await assert.rejects(
			() =>
				ledger.updateAccount(context, account.id, {
					idempotencyKey: 'currency-after-purge',
					version: accountView.version,
					name: 'Cash',
					type: 'cash',
					currency: 'USD',
					openingBalanceMinor: '100'
				}),
			/currency is immutable/i
		);

		await assert.rejects(
			() =>
				ledger.createAccount(context, {
					idempotencyKey: 'noncanonical-minor',
					name: 'Invalid',
					type: 'cash',
					currency: 'EUR',
					openingBalanceMinor: '01'
				}),
			/canonical decimal integer/i
		);
		for (const openingBalanceMinor of ['9223372036854775808', '-9223372036854775809']) {
			await assert.rejects(
				() =>
					ledger.createAccount(context, {
						idempotencyKey: `out-of-range-${openingBalanceMinor}`,
						name: 'Invalid',
						type: 'cash',
						currency: 'EUR',
						openingBalanceMinor
					}),
				/signed 64-bit integer range/i
			);
		}

		const aggregate = await ledger.createAccount(context, {
			idempotencyKey: 'aggregate-account',
			name: 'Aggregate',
			type: 'cash',
			currency: 'EUR',
			openingBalanceMinor: '-9223372036854775808'
		});
		await financial.db.insert(ledgerTransaction).values([
			{
				id: 'aggregate-income-1',
				workspaceId: context.workspaceId,
				accountId: aggregate.id,
				kind: 'income',
				amountMinor: 9223372036854775807n,
				date: '2026-07-30'
			},
			{
				id: 'aggregate-income-2',
				workspaceId: context.workspaceId,
				accountId: aggregate.id,
				kind: 'income',
				amountMinor: 9223372036854775807n,
				date: '2026-07-30'
			},
			{
				id: 'aggregate-expense',
				workspaceId: context.workspaceId,
				accountId: aggregate.id,
				kind: 'expense',
				amountMinor: 9223372036854775807n,
				date: '2026-07-30'
			}
		]);
		assert.equal(
			(await ledger.listAccounts(context)).find(({ id }) => id === aggregate.id)?.balanceMinor,
			'-1',
			'intermediate bigint aggregation may exceed int64 when the final balance does not'
		);
		await financial.db.insert(ledgerTransaction).values({
			id: 'aggregate-overflow',
			workspaceId: context.workspaceId,
			accountId: aggregate.id,
			kind: 'income',
			amountMinor: 2n,
			date: '2026-07-30'
		});
		assert.equal(
			(await ledger.listAccounts(context)).find(({ id }) => id === aggregate.id)?.balanceMinor,
			'1'
		);
		await financial.db.insert(ledgerTransaction).values({
			id: 'aggregate-final-overflow',
			workspaceId: context.workspaceId,
			accountId: aggregate.id,
			kind: 'income',
			amountMinor: 9223372036854775807n,
			date: '2026-07-30'
		});
		await assert.rejects(
			() => ledger.listAccounts(context),
			/balance exceeds the signed 64-bit integer range/i
		);
	} finally {
		financial?.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});

test('transfers and dated reconciliation are atomic, exact and versioned', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-transfer-'));
	const url = `file:${join(directory, 'ledger.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db
			.insert(user)
			.values({ id: 'transfer-owner', name: 'Owner', email: 'transfer@example.com' });
		const result = await connection.client.execute(
			"select id from workspace where personal_owner_user_id = 'transfer-owner'"
		);
		const context = { userId: 'transfer-owner', workspaceId: String(result.rows[0].id) };
		const ledger = createLedgerRepository(financial.db);
		const create = (name: string, currency = 'EUR') =>
			ledger.createAccount(context, {
				idempotencyKey: `account-${name}`,
				name,
				type: 'cash',
				currency,
				openingBalanceMinor: name === 'From' ? '1000' : '100'
			});
		const from = await create('From'),
			to = await create('To'),
			usd = await create('Usd', 'USD');
		await assert.rejects(
			() =>
				ledger.createTransfer(context, {
					idempotencyKey: 'same-account',
					fromAccountId: from.id,
					toAccountId: from.id,
					amountMinor: '1',
					date: '2026-07-30'
				}),
			/different/
		);
		const cross = await ledger.createTransfer(context, {
			idempotencyKey: 'cross-currency-exact',
			fromAccountId: from.id,
			toAccountId: usd.id,
			amountMinor: '123',
			receivedAmountMinor: '117',
			date: '2026-07-30'
		});
		assert.equal(cross.sentAmountMinor, '123');
		assert.equal(cross.receivedAmountMinor, '117');
		await financial.db.delete(ledgerTransfer).where(eq(ledgerTransfer.id, cross.id));

		await connection.client.execute(
			"CREATE TRIGGER fail_transfer_to BEFORE INSERT ON ledger_transaction WHEN NEW.transfer_side = 'to' BEGIN SELECT RAISE(ABORT, 'partial side failure'); END"
		);
		await assert.rejects(() =>
			ledger.createTransfer(context, {
				idempotencyKey: 'rollback-transfer',
				fromAccountId: from.id,
				toAccountId: to.id,
				amountMinor: '300',
				date: '2026-07-30'
			})
		);
		assert.equal((await financial.db.select().from(ledgerTransfer)).length, 0);
		assert.equal(
			(await financial.db.select().from(ledgerTransaction)).length,
			0,
			'neither side is orphaned'
		);
		await connection.client.execute('DROP TRIGGER fail_transfer_to');

		const transfer = await ledger.createTransfer(context, {
			idempotencyKey: 'good-transfer',
			fromAccountId: from.id,
			toAccountId: to.id,
			amountMinor: '300',
			date: '2026-07-30'
		});
		assert.equal((await financial.db.select().from(ledgerTransaction)).length, 2);
		assert.equal(
			(await ledger.listTransactions(context, from.id)).length,
			0,
			'transfer sides are not manual transactions'
		);
		assert.deepEqual(
			(await ledger.listTransfers(context, from.id)).map(({ id }) => id),
			[transfer.id],
			'an account reads one transfer aggregate'
		);
		let accounts = await ledger.listAccounts(context);
		assert.equal(accounts.find((a) => a.id === from.id)?.balanceMinor, '700');
		assert.equal(accounts.find((a) => a.id === to.id)?.balanceMinor, '400');
		const duplicate = await ledger.createTransfer(context, {
			idempotencyKey: 'good-transfer',
			fromAccountId: from.id,
			toAccountId: to.id,
			amountMinor: '300',
			date: '2026-07-30'
		});
		assert.equal(duplicate.id, transfer.id);
		assert.equal((await financial.db.select().from(ledgerTransaction)).length, 2);
		const [corruptSide] = await financial.db
			.select()
			.from(ledgerTransaction)
			.where(eq(ledgerTransaction.transferId, transfer.id));
		await financial.db
			.update(ledgerTransaction)
			.set({ description: 'corrupt' })
			.where(eq(ledgerTransaction.id, corruptSide.id));
		await assert.rejects(
			() =>
				ledger.updateTransfer(context, transfer.id, {
					idempotencyKey: 'corrupt-update',
					version: 1,
					toAccountId: to.id,
					amountMinor: '200',
					date: '2026-07-30'
				}),
			/corrupt or incomplete/i
		);
		assert.equal(
			(
				await financial.db
					.select()
					.from(ledgerTransaction)
					.where(eq(ledgerTransaction.id, corruptSide.id))
			)[0].amountMinor,
			300n,
			'corruption rolls back the leg edit'
		);
		await financial.db
			.update(ledgerTransaction)
			.set({ description: null })
			.where(eq(ledgerTransaction.id, corruptSide.id));
		await assert.rejects(
			() =>
				ledger.transferAction(context, transfer.id, 'trash', {
					idempotencyKey: 'stale-transfer',
					version: 9
				}),
			/stale/
		);
		const trashed = await ledger.transferAction(context, transfer.id, 'trash', {
			idempotencyKey: 'trash-transfer',
			version: 1
		});
		assert.equal((await ledger.listTransfers(context, from.id)).length, 0);
		assert.equal(
			typeof (await ledger.listTransfers(context, from.id, true))[0].trashedAt === 'string',
			true,
			'trashed transfers can be reloaded for restore'
		);
		accounts = await ledger.listAccounts(context);
		assert.equal(accounts.find((a) => a.id === from.id)?.balanceMinor, '1000');
		assert.equal(accounts.find((a) => a.id === to.id)?.balanceMinor, '100');
		await ledger.transferAction(context, transfer.id, 'restore', {
			idempotencyKey: 'restore-transfer',
			version: trashed.version
		});

		await ledger.createTransaction(context, from.id, {
			idempotencyKey: 'later-expense',
			kind: 'expense',
			amountMinor: '50',
			date: '2026-07-31'
		});
		const check = await ledger.createBalanceCheck(context, {
			idempotencyKey: 'dated-check',
			accountId: from.id,
			date: '2026-07-30',
			observedBalanceMinor: '750'
		});
		const sameDateCheck = await ledger.createBalanceCheck(context, {
			idempotencyKey: 'same-date-check',
			accountId: from.id,
			date: '2026-07-30',
			observedBalanceMinor: '760'
		});
		assert.equal(check.calculatedBalanceMinor, '700');
		assert.equal(check.differenceMinor, '50', 'later activity is excluded');
		const correction = await ledger.createBalanceCorrection(context, {
			idempotencyKey: 'explicit-correction',
			accountId: from.id,
			date: '2026-07-30',
			amountMinor: '50'
		});
		assert.deepEqual(
			(await ledger.listBalanceCorrections(context, from.id)).map(({ id }) => id),
			[correction.id]
		);
		assert.equal(
			(await ledger.listAccounts(context)).find((a) => a.id === from.id)?.balanceMinor,
			'700'
		);
		const listedChecks = await ledger.listBalanceChecks(context, from.id);
		assert.equal(listedChecks.length, 2);
		const recalculated = listedChecks.find(({ id }) => id === check.id)!;
		const sameDateRecalculated = listedChecks.find(({ id }) => id === sameDateCheck.id)!;
		assert.equal(recalculated.calculatedBalanceMinor, '750');
		assert.equal(recalculated.differenceMinor, '0');
		assert.equal(sameDateRecalculated.calculatedBalanceMinor, '750');
		assert.equal(sameDateRecalculated.differenceMinor, '10');
		await ledger.updateTransaction(
			context,
			(await ledger.listTransactions(context, from.id)).find((row) => row.source === 'manual')!.id,
			{
				idempotencyKey: 'edit-earlier',
				version: 1,
				kind: 'expense',
				amountMinor: '25',
				date: '2026-07-29'
			}
		);
		assert.equal((await ledger.listBalanceChecks(context, from.id))[0].differenceMinor, '25');
		assert.equal(
			(
				await financial.db
					.select()
					.from(ledgerBalanceCorrection)
					.where(eq(ledgerBalanceCorrection.id, correction.id))
			)[0].amountMinor,
			'50',
			'correction is never silently changed'
		);
		const boundaryAccount = await ledger.createAccount(context, {
			idempotencyKey: 'boundary-account',
			name: 'Boundary',
			type: 'cash',
			currency: 'EUR',
			openingBalanceMinor: '-9223372036854775808'
		});
		const boundaryCheck = await ledger.createBalanceCheck(context, {
			idempotencyKey: 'boundary-check',
			accountId: boundaryAccount.id,
			date: '2026-07-30',
			observedBalanceMinor: '9223372036854775807'
		});
		assert.equal(boundaryCheck.differenceMinor, '18446744073709551615');
		const boundaryCorrection = await ledger.createBalanceCorrection(context, {
			idempotencyKey: 'boundary-correction',
			accountId: boundaryAccount.id,
			date: '2026-07-30',
			amountMinor: '18446744073709551615'
		});
		assert.equal(boundaryCorrection.amountMinor, '18446744073709551615');
		assert.equal(
			(await ledger.listAccounts(context)).find((a) => a.id === boundaryAccount.id)?.balanceMinor,
			'9223372036854775807'
		);
		await assert.rejects(
			() =>
				ledger.createBalanceCorrection(context, {
					idempotencyKey: 'outside-wide-bound',
					accountId: boundaryAccount.id,
					date: '2026-07-30',
					amountMinor: '18446744073709551616'
				}),
			/outside the balance difference range/i
		);
		await assert.rejects(
			() =>
				ledger.createBalanceCorrection(context, {
					idempotencyKey: 'final-balance-overflow',
					accountId: boundaryAccount.id,
					date: '2026-07-30',
					amountMinor: '1'
				}),
			/balance exceeds/i
		);
		assert.deepEqual(
			(await ledger.listBalanceCorrections(context, boundaryAccount.id)).map(
				(row) => row.amountMinor
			),
			['18446744073709551615'],
			'overflowing correction rolls back'
		);
		assert.equal((await ledger.history(context, 'transfer', transfer.id)).length, 3);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
