import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { ledgerAudit, ledgerTransaction, mutationReceipt, user } from '../schema';
import { createLedgerRepository, LedgerError } from './ledger';

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
		assert.equal(await ledger.purgeTrashed(cutoff), 1, 'trash older than the cutoff is purged');
		assert.equal(
			(await financial.db.select().from(ledgerAudit)).length,
			5,
			'system transaction purge preserves full user audit history and adds no purge audit'
		);
		await financial.db.update(mutationReceipt).set({ createdAt: new Date(cutoff.getTime() - 1) });
		const lifecycle = await ledger.purgeLifecycle(cutoff, cutoff);
		assert.equal(lifecycle.transactions, 0);
		assert.ok(
			lifecycle.idempotencyReceipts > 0,
			'expired 37-day receipts are independently purged'
		);

		const accountView = (await ledger.listAccounts(context))[0];
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
