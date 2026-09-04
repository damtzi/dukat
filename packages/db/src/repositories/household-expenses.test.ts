import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import {
	financialAccount,
	householdExpense,
	ledgerCategory,
	ledgerTransaction,
	user,
	workspace,
	workspaceMembership
} from '../schema';
import { createInsightsRepository } from './insights';
import { createLedgerRepository, LedgerError } from './ledger';

test('private-funded Household expenses preserve privacy, balances, spending, lifecycle, and access', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-household-expense-'));
	const url = `file:${join(directory, 'ledger.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{
				id: 'payer',
				name: 'Pat Payer',
				username: 'pat_payer',
				email: 'payer@example.com'
			},
			{
				id: 'member',
				name: 'Morgan Member',
				username: 'morgan_member',
				email: 'member@example.com'
			},
			{
				id: 'outsider',
				name: 'Unaffiliated User',
				username: 'unaffiliated',
				email: 'outsider@example.com'
			}
		]);
		const [personal] = await connection.db
			.select()
			.from(workspace)
			.where(eq(workspace.personalOwnerUserId, 'payer'));
		await connection.db.insert(workspace).values({
			id: 'household',
			name: 'Shared home',
			type: 'household',
			reportingCurrency: 'PLN'
		});
		await connection.db.insert(workspaceMembership).values([
			{ workspaceId: 'household', userId: 'payer', role: 'owner' },
			{ workspaceId: 'household', userId: 'member', role: 'member' }
		]);
		await financial.db.insert(financialAccount).values([
			{
				id: 'secret-account',
				workspaceId: personal.id,
				name: 'Secret Personal Card',
				type: 'current',
				currency: 'PLN',
				openingDate: '2026-01-01',
				openingBalanceMinor: 10000n
			},
			{
				id: 'household-cash',
				workspaceId: 'household',
				name: 'Shared cash',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-01-01',
				openingBalanceMinor: 7000n
			}
		]);
		const [groceries] = await financial.db
			.select()
			.from(ledgerCategory)
			.where(
				and(
					eq(ledgerCategory.workspaceId, 'household'),
					eq(ledgerCategory.normalizedName, 'groceries')
				)
			);

		const ledger = createLedgerRepository(financial.db);
		const insights = createInsightsRepository(financial.db);
		const payerContext = { userId: 'payer', workspaceId: 'household' };
		const input = {
			idempotencyKey: 'private-household-expense',
			accountId: 'secret-account',
			amountMinor: '2500',
			date: '2026-08-01',
			merchant: 'Corner Market',
			description: 'Weekly food',
			categoryId: groceries.id
		};
		const created = await ledger.createHouseholdExpense(payerContext, input);
		const replayed = await ledger.createHouseholdExpense(payerContext, input);
		assert.deepEqual(replayed, created);
		assert.equal((await financial.db.select().from(householdExpense)).length, 1);
		assert.equal((await financial.db.select().from(ledgerTransaction)).length, 1);
		assert.deepEqual(created.payer, {
			userId: 'payer',
			name: 'Pat Payer',
			username: 'pat_payer',
			image: null
		});
		assert.equal(created.canManage, true);

		const [memberView] = await ledger.listHouseholdExpenses({
			userId: 'member',
			workspaceId: 'household'
		});
		assert.equal(memberView.canManage, false);
		const serialized = JSON.stringify(memberView);
		for (const privateValue of [personal.id, 'secret-account', 'Secret Personal Card'])
			assert.ok(!serialized.includes(privateValue));

		assert.equal(
			(await ledger.listAccounts({ userId: 'payer', workspaceId: personal.id }))[0].balanceMinor,
			'7500'
		);
		assert.equal((await ledger.listAccounts(payerContext))[0].balanceMinor, '7000');
		assert.deepEqual(
			await insights.summary(
				{ userId: 'payer', workspaceId: personal.id },
				{ startDate: '2026-01-01', endDate: '2026-12-31' }
			),
			{ currencies: [] }
		);
		const householdSummary = await insights.summary(payerContext, {
			startDate: '2026-01-01',
			endDate: '2026-12-31'
		});
		assert.equal(householdSummary.currencies[0]?.spendingMinor, '2500');
		assert.equal(householdSummary.currencies[0]?.groups[0]?.transactions[0]?.accountId, null);

		await assert.rejects(
			() =>
				ledger.updateHouseholdExpense({ userId: 'member', workspaceId: 'household' }, created.id, {
					...input,
					idempotencyKey: 'member-edit',
					version: 1
				}),
			(error) => error instanceof LedgerError && error.code === 'not_found'
		);
		const updated = await ledger.updateHouseholdExpense(payerContext, created.id, {
			idempotencyKey: 'payer-edit',
			version: 1,
			amountMinor: '3000',
			date: '2026-08-02',
			merchant: 'New Market',
			description: 'Updated food',
			categoryId: groceries.id
		});
		assert.equal(updated.version, 2);
		assert.equal(
			(await ledger.listAccounts({ userId: 'payer', workspaceId: personal.id }))[0].balanceMinor,
			'7000'
		);
		assert.equal(
			(
				await insights.summary(payerContext, {
					startDate: '2026-01-01',
					endDate: '2026-12-31'
				})
			).currencies[0]?.spendingMinor,
			'3000'
		);
		const [source] = await financial.db
			.select()
			.from(ledgerTransaction)
			.where(eq(ledgerTransaction.accountId, 'secret-account'));
		assert.equal(source.amountMinor, 3000n);

		const trashed = await ledger.householdExpenseAction(payerContext, created.id, 'trash', {
			idempotencyKey: 'payer-trash',
			version: 2
		});
		assert.ok(trashed.trashedAt);
		assert.equal((await ledger.listHouseholdExpenses(payerContext)).length, 0);
		assert.equal(
			(await ledger.listAccounts({ userId: 'payer', workspaceId: personal.id }))[0].balanceMinor,
			'10000'
		);
		assert.deepEqual(
			await insights.summary(payerContext, {
				startDate: '2026-01-01',
				endDate: '2026-12-31'
			}),
			{ currencies: [] }
		);
		const restored = await ledger.householdExpenseAction(payerContext, created.id, 'restore', {
			idempotencyKey: 'payer-restore',
			version: 3
		});
		assert.equal(restored.trashedAt, null);
		assert.equal(
			(
				await insights.summary(payerContext, {
					startDate: '2026-01-01',
					endDate: '2026-12-31'
				})
			).currencies[0]?.spendingMinor,
			'3000'
		);

		await connection.db
			.delete(workspaceMembership)
			.where(
				and(
					eq(workspaceMembership.workspaceId, 'household'),
					eq(workspaceMembership.userId, 'member')
				)
			);
		for (const userId of ['member', 'outsider']) {
			const context = { userId, workspaceId: 'household' };
			const unauthorizedOperations = [
				() => ledger.listHouseholdExpenses(context),
				() =>
					ledger.createHouseholdExpense(context, {
						...input,
						idempotencyKey: `${userId}-create`
					}),
				() =>
					ledger.updateHouseholdExpense(context, created.id, {
						...input,
						idempotencyKey: `${userId}-update`,
						version: restored.version
					}),
				() =>
					ledger.householdExpenseAction(context, created.id, 'trash', {
						idempotencyKey: `${userId}-trash`,
						version: restored.version
					}),
				() =>
					ledger.householdExpenseAction(context, created.id, 'restore', {
						idempotencyKey: `${userId}-restore`,
						version: restored.version
					})
			];
			for (const operation of unauthorizedOperations)
				await assert.rejects(
					operation,
					(error) => error instanceof LedgerError && error.code === 'not_found'
				);
		}
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
