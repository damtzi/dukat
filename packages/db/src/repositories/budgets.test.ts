import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { financialAccount, user, workspace, workspaceMembership } from '../schema';
import { createBudgetRepository, BudgetError } from './budgets';
import { createExchangeRateRepository } from './exchange-rates';
import { createInsightsRepository } from './insights';
import { createLedgerRepository } from './ledger';
import { createPlanningRepository } from './planning';

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-budgets-'));
	const url = `file:${join(directory, 'db.sqlite')}`;
	const connection = createDatabase({ url });
	await migrate(connection.db, {
		migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
	});
	await connection.db.insert(user).values([
		{ id: 'owner', name: 'Owner', username: 'owner', email: 'owner@budgets.test' },
		{ id: 'outsider', name: 'Outsider', username: 'outsider', email: 'outsider@budgets.test' }
	]);
	const workspaces = await connection.client.execute(
		'select id, personal_owner_user_id from workspace where personal_owner_user_id is not null'
	);
	const workspaceId = String(
		workspaces.rows.find((row) => row.personal_owner_user_id === 'owner')!.id
	);
	const financial = createFinancialDatabase({ url });
	await financial.db.insert(financialAccount).values({
		id: 'eur',
		workspaceId,
		name: 'EUR cash',
		type: 'cash',
		currency: 'EUR',
		openingDate: '2026-01-01',
		openingBalanceMinor: 0n
	});
	const rates = createExchangeRateRepository(financial.db);
	await rates.cacheTables([
		{
			table: 'A',
			no: '001/A/NBP/2026',
			effectiveDate: '2026-08-01',
			rates: [{ code: 'EUR', mid: '4' }]
		}
	]);
	return {
		connection,
		financial,
		context: { userId: 'owner', workspaceId },
		insights: createInsightsRepository(financial.db),
		ledger: createLedgerRepository(financial.db),
		planning: createPlanningRepository(financial.db, () => new Date('2026-08-01T12:00:00Z')),
		budgets: createBudgetRepository(financial.db, rates),
		async close() {
			financial.client.close();
			connection.client.close();
			await rm(directory, { recursive: true, force: true });
		}
	};
}

test('a monthly category budget moves from available to forecast overspend', async () => {
	const f = await fixture();
	try {
		const groceries = (await f.insights.listCategories(f.context)).find(
			(category) => category.name === 'Groceries'
		)!;
		const created = await f.budgets.create(f.context, {
			categoryId: groceries.id,
			month: '2026-08',
			amountMinor: '10000',
			idempotencyKey: 'create-budget'
		});
		const expense = await f.ledger.createTransaction(f.context, 'eur', {
			kind: 'expense',
			amountMinor: '1000',
			date: '2026-08-02',
			categoryId: groceries.id,
			idempotencyKey: 'budget-expense'
		});
		await f.ledger.createRefund(f.context, expense.transaction.id, {
			amountMinor: '250',
			date: '2026-08-03',
			idempotencyKey: 'budget-refund'
		});
		await f.planning.create(f.context, {
			accountId: 'eur',
			kind: 'expense',
			amountMinor: '2000',
			date: '2026-08-10',
			status: 'expected',
			categoryId: groceries.id,
			idempotencyKey: 'expected-plan'
		});
		await f.planning.create(f.context, {
			accountId: 'eur',
			kind: 'expense',
			amountMinor: '1000',
			date: '2026-08-20',
			status: 'tentative',
			categoryId: groceries.id,
			idempotencyKey: 'tentative-plan'
		});

		assert.deepEqual(await f.budgets.report(f.context, '2026-08', false), [
			{
				...created,
				categoryName: 'Groceries',
				completedMinor: '3000',
				expectedMinor: '8000',
				remainingMinor: '7000',
				forecastOverspendMinor: '1000',
				missingRate: false
			}
		]);
		assert.equal(
			(await f.budgets.report(f.context, '2026-08', true))[0]!.forecastOverspendMinor,
			'5000'
		);

		const updated = await f.budgets.update(f.context, created.id, {
			amountMinor: '20000',
			version: created.version,
			idempotencyKey: 'update-budget'
		});
		assert.equal(updated.amountMinor, '20000');
		await f.budgets.remove(f.context, created.id, {
			version: updated.version,
			idempotencyKey: 'remove-budget'
		});
		assert.deepEqual(await f.budgets.report(f.context, '2026-08', false), []);
	} finally {
		await f.close();
	}
});

test('members can mutate budgets without crossing workspace boundaries', async () => {
	const f = await fixture();
	try {
		const category = (await f.insights.listCategories(f.context))[0]!;
		const personalBudget = await f.budgets.create(f.context, {
			categoryId: category.id,
			month: '2026-08',
			amountMinor: '10000',
			idempotencyKey: 'unique-budget'
		});
		await assert.rejects(
			f.budgets.create(f.context, {
				categoryId: category.id,
				month: '2026-08',
				amountMinor: '20000',
				idempotencyKey: 'duplicate-budget'
			}),
			(error) => error instanceof BudgetError && error.code === 'conflict'
		);
		await assert.rejects(
			f.budgets.report({ ...f.context, userId: 'outsider' }, '2026-08', false),
			(error) => error instanceof BudgetError && error.code === 'not_found'
		);

		await f.financial.db.insert(workspace).values({
			id: 'household',
			name: 'Household',
			type: 'household',
			reportingCurrency: 'PLN'
		});
		await f.financial.db.insert(workspaceMembership).values({
			workspaceId: 'household',
			userId: 'outsider',
			role: 'member'
		});
		const householdContext = { userId: 'outsider', workspaceId: 'household' };
		const householdCategory = (await f.insights.listCategories(householdContext)).find(
			(item) => item.name === category.name
		)!;
		const householdBudget = await f.budgets.create(householdContext, {
			categoryId: householdCategory.id,
			month: '2026-08',
			amountMinor: '20000',
			idempotencyKey: 'household-budget'
		});
		assert.equal((await f.budgets.report(f.context, '2026-08'))[0]!.id, personalBudget.id);
		assert.equal((await f.budgets.report(householdContext, '2026-08'))[0]!.id, householdBudget.id);
		const updated = await f.budgets.update(householdContext, householdBudget.id, {
			amountMinor: '25000',
			version: householdBudget.version,
			idempotencyKey: 'update-household-budget'
		});
		await f.budgets.remove(householdContext, updated.id, {
			version: updated.version,
			idempotencyKey: 'remove-household-budget'
		});
		assert.deepEqual(await f.budgets.report(householdContext, '2026-08'), []);
	} finally {
		await f.close();
	}
});

test('one category missing an exchange rate does not block another budget', async () => {
	const f = await fixture();
	try {
		const groceries = (await f.insights.listCategories(f.context)).find(
			(category) => category.name === 'Groceries'
		)!;
		const unrelated = await f.insights.createCategory(f.context, {
			name: 'Unrelated',
			idempotencyKey: 'create-unrelated'
		});
		await f.financial.db.insert(financialAccount).values({
			id: 'usd',
			workspaceId: f.context.workspaceId,
			name: 'USD cash',
			type: 'cash',
			currency: 'USD',
			openingDate: '2026-01-01',
			openingBalanceMinor: 0n
		});
		await f.budgets.create(f.context, {
			categoryId: groceries.id,
			month: '2026-08',
			amountMinor: '10000',
			idempotencyKey: 'create-isolated-budget'
		});
		await f.budgets.create(f.context, {
			categoryId: unrelated.id,
			month: '2026-08',
			amountMinor: '10000',
			idempotencyKey: 'create-unrelated-budget'
		});
		await f.ledger.createTransaction(f.context, 'usd', {
			kind: 'expense',
			amountMinor: '1000',
			date: '2026-08-02',
			categoryId: unrelated.id,
			idempotencyKey: 'unrelated-expense'
		});

		const report = await f.budgets.report(f.context, '2026-08');
		const groceriesReport = report.find((item) => item.categoryId === groceries.id)!;
		const unrelatedReport = report.find((item) => item.categoryId === unrelated.id)!;
		assert.equal(groceriesReport.missingRate, false);
		assert.equal(groceriesReport.remainingMinor, '10000');
		assert.equal(unrelatedReport.missingRate, true);
	} finally {
		await f.close();
	}
});
