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
	ledgerAudit,
	ledgerCategory,
	ledgerImportBatch,
	ledgerTransaction,
	ledgerTransfer,
	mutationReceipt,
	user,
	workspace,
	workspaceManualRate,
	workspaceMembership
} from '../schema';
import { createExchangeRateRepository, createNbpAdapter } from './exchange-rates';
import { createInsightsRepository, STARTER_CATEGORIES } from './insights';
import { createLedgerRepository, LedgerError } from './ledger';

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-insights-'));
	const url = `file:${join(directory, 'db.sqlite')}`;
	const connection = createDatabase({ url });
	await migrate(connection.db, {
		migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
	});
	await connection.db.insert(user).values([
		{ id: 'owner', name: 'Owner', username: 'owner', email: 'owner@insights.test' },
		{ id: 'outsider', name: 'Outsider', username: 'outsider', email: 'outsider@insights.test' }
	]);
	const rows = await connection.client.execute(
		'select id, personal_owner_user_id from workspace where personal_owner_user_id is not null'
	);
	const workspaceId = String(rows.rows.find((r) => r.personal_owner_user_id === 'owner')!.id);
	const outsiderWorkspaceId = String(
		rows.rows.find((r) => r.personal_owner_user_id === 'outsider')!.id
	);
	const financial = createFinancialDatabase({ url });
	await financial.db.insert(financialAccount).values([
		{
			id: 'eur',
			workspaceId,
			name: 'EUR',
			type: 'cash',
			currency: 'EUR',
			openingDate: '2026-01-01',
			openingBalanceMinor: 0n
		},
		{
			id: 'usd',
			workspaceId,
			name: 'USD',
			type: 'cash',
			currency: 'USD',
			openingDate: '2026-01-01',
			openingBalanceMinor: 0n
		},
		{
			id: 'foreign',
			workspaceId: outsiderWorkspaceId,
			name: 'Foreign',
			type: 'cash',
			currency: 'EUR',
			openingDate: '2026-01-01',
			openingBalanceMinor: 0n
		}
	]);
	return {
		...connection,
		financial,
		repo: createInsightsRepository(financial.db),
		ledger: createLedgerRepository(financial.db),
		context: { userId: 'owner', workspaceId },
		outsiderWorkspaceId,
		async close() {
			financial.client.close();
			connection.client.close();
			await rm(directory, { recursive: true, force: true });
		}
	};
}

const rejected = (code: string) => (error: unknown) =>
	error instanceof LedgerError && error.code === code;

test('a refund reduces original-category spending without becoming income', async () => {
	const f = await fixture();
	try {
		const groceries = (await f.repo.listCategories(f.context)).find(
			(category) => category.name === 'Groceries'
		)!;
		const expense = await f.ledger.createTransaction(f.context, 'eur', {
			idempotencyKey: 'refund-report-expense',
			kind: 'expense',
			amountMinor: '6000',
			date: '2026-08-01',
			description: 'Groceries',
			categoryId: groceries.id
		});
		await f.ledger.createRefund(f.context, expense.transaction.id, {
			idempotencyKey: 'refund-report-partial',
			amountMinor: '2500',
			date: '2026-08-02',
			description: 'Returned groceries'
		});

		const summary = await f.repo.summary(f.context, {
			startDate: '2026-08-01',
			endDate: '2026-08-31'
		});
		const eur = summary.currencies.find(({ currency }) => currency === 'EUR')!;
		assert.equal(eur.incomeMinor, '0');
		assert.equal(eur.spendingMinor, '3500');
		const group = eur.groups.find(({ categoryId }) => categoryId === groceries.id)!;
		assert.equal(group.kind, 'expense');
		assert.equal(group.categoryName, 'Groceries');
		assert.equal(group.amountMinor, '3500');
		assert.deepEqual(
			group.transactions.map(({ kind, amountMinor, description }) => ({
				kind,
				amountMinor,
				description
			})),
			[
				{ kind: 'expense', amountMinor: '6000', description: 'Groceries' },
				{ kind: 'refund', amountMinor: '-2500', description: 'Returned groceries' }
			]
		);
	} finally {
		await f.close();
	}
});

test('migration seeds exactly the twelve starter categories for every future workspace', async () => {
	const f = await fixture();
	try {
		await f.db.insert(workspace).values({ id: 'future', name: 'Future', type: 'household' });
		await f.db
			.insert(workspaceMembership)
			.values({ workspaceId: 'future', userId: 'owner', role: 'owner' });
		const names = (
			await f.db.select().from(ledgerCategory).where(eq(ledgerCategory.workspaceId, 'future'))
		).map((row) => row.name);
		assert.equal(names.length, 12);
		assert.deepEqual(new Set(names), new Set(STARTER_CATEGORIES));
	} finally {
		await f.close();
	}
});

test('NBP cache, effective-date lookup, manual override and removal stay reproducible', async () => {
	const f = await fixture();
	try {
		const rates = createExchangeRateRepository(f.financial.db);
		await rates.cacheTables([
			{
				table: 'A',
				no: '001/A/NBP/2026',
				effectiveDate: '2026-07-31',
				rates: [
					{ code: 'EUR', mid: '4' },
					{ code: 'USD', mid: '3' }
				]
			},
			{
				table: 'A',
				no: '002/A/NBP/2026',
				effectiveDate: '2026-08-03',
				rates: [
					{ code: 'EUR', mid: '5' },
					{ code: 'USD', mid: '4' }
				]
			}
		]);
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02'))?.rateToPln, '4');
		await rates.addOverride('owner', f.context.workspaceId, {
			currency: 'EUR',
			rateToPln: '99',
			effectiveDate: '2099-01-01',
			reason: 'Future contract rate'
		});
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR'))?.rateToPln, '5');
		const manual = await rates.addOverride('owner', f.context.workspaceId, {
			currency: 'EUR',
			rateToPln: '6',
			effectiveDate: '2026-08-01',
			reason: 'Bank statement rate'
		});
		assert.equal(
			(await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02'))?.source,
			'manual'
		);
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-03'))?.rateToPln, '5');
		const summary = await rates.reportingSummary(f.context.workspaceId, {
			currencies: [
				{
					currency: 'EUR',
					incomeMinor: '100',
					spendingMinor: '0',
					uncategorizedMinor: '100',
					groups: [
						{
							kind: 'income',
							categoryId: null,
							categoryName: 'Uncategorized',
							amountMinor: '100',
							transactions: [
								{
									id: 'summary-transaction',
									accountId: 'eur',
									date: '2026-08-02',
									kind: 'income',
									amountMinor: '100',
									description: null
								}
							]
						}
					]
				}
			]
		});
		assert.equal(summary.reporting.incomeMinor, '600');
		assert.deepEqual(
			summary.reporting.rates.map((rate) => [rate.currency, rate.source, rate.effectiveDate]),
			[
				['EUR', 'manual', '2026-08-01'],
				['PLN', 'identity', '2026-08-02']
			]
		);
		const cashFlow = await rates.reportingCashFlow(
			f.context.workspaceId,
			{
				currencies: [
					{
						currency: 'EUR',
						incomeMinor: '100',
						spendingMinor: '0',
						uncategorizedMinor: '100',
						groups: [
							{
								kind: 'income',
								categoryId: null,
								categoryName: 'Uncategorized',
								amountMinor: '100',
								transactions: [
									{
										id: 'cash-flow-transaction',
										accountId: 'eur',
										date: '2026-08-02',
										kind: 'income',
										amountMinor: '100',
										description: null
									}
								]
							}
						]
					}
				]
			},
			'2026-07-01',
			'2026-08-31'
		);
		assert.deepEqual(cashFlow.reporting.months, [
			{ month: '2026-07', incomeMinor: '0', spendingMinor: '0', netMinor: '0' },
			{ month: '2026-08', incomeMinor: '600', spendingMinor: '0', netMinor: '600' }
		]);
		assert.equal(cashFlow.reporting.netMinor, '600');
		await f.financial.db
			.update(workspace)
			.set({ reportingCurrency: 'USD' })
			.where(eq(workspace.id, f.context.workspaceId));
		const balances = await rates.currentBalances('owner', f.context.workspaceId, {
			async listAccounts() {
				return [{ id: 'eur', currency: 'EUR', balanceMinor: '100' }];
			}
		});
		assert.deepEqual(
			balances.accounts[0].rates.map((rate) => rate.currency),
			['EUR', 'USD']
		);
		const forecast = await rates.workspaceForecast('owner', f.context.workspaceId, [
			{
				id: 'eur',
				currency: 'EUR',
				startingBalanceMinor: '100',
				endingBalanceMinor: '80',
				occurrences: [
					{
						planId: 'expense',
						originalDate: '2026-09-01',
						date: '2026-09-01',
						kind: 'expense',
						status: 'expected',
						amountMinor: '20'
					}
				]
			},
			{
				id: 'usd',
				currency: 'USD',
				startingBalanceMinor: '200',
				endingBalanceMinor: '210',
				occurrences: [
					{
						planId: 'income',
						originalDate: '2026-09-02',
						date: '2026-09-02',
						kind: 'income',
						status: 'expected',
						amountMinor: '10'
					}
				]
			}
		]);
		assert.equal(forecast.reportingCurrency, 'USD');
		assert.equal(forecast.startingBalanceMinor, '325');
		assert.equal(forecast.endingBalanceMinor, '310');
		assert.deepEqual(
			forecast.points.map((point) => [point.planId, point.projectedBalanceMinor]),
			[
				['expense', '300'],
				['income', '310']
			]
		);
		const quote = await rates.quote('owner', f.context.workspaceId, {
			fromCurrency: 'EUR',
			toCurrency: 'USD',
			date: '2026-08-02',
			amountMinor: '100'
		});
		assert.equal(quote.suggestedAmountMinor, '200');
		assert.deepEqual(
			quote.rates.map((rate) => [rate.currency, rate.source]),
			[
				['EUR', 'manual'],
				['USD', 'NBP']
			]
		);
		await rates.removeOverride('owner', f.context.workspaceId, manual.id);
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02'))?.rateToPln, '4');
		const [audit] = await f.financial.db
			.select()
			.from(workspaceManualRate)
			.where(eq(workspaceManualRate.id, manual.id));
		assert.equal(audit.removedByUserId, 'owner');
		assert.ok(audit.removedAt);
		const replacement = await rates.addOverride('owner', f.context.workspaceId, {
			currency: 'EUR',
			rateToPln: '6.1',
			effectiveDate: '2026-08-01',
			reason: 'Corrected bank statement rate'
		});
		assert.notEqual(replacement.id, manual.id);
	} finally {
		await f.close();
	}
});

test('NBP historical adapter splits requests into at most 93-day windows', async () => {
	const urls: string[] = [];
	const adapter = createNbpAdapter(async (input) => {
		urls.push(String(input));
		return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
	});
	await adapter.historical('2026-01-01', '2026-07-31');
	assert.equal(urls.length, 3);
	assert.match(urls[0], /2026-01-01\/2026-04-03/);
});

test('NBP adapter aborts a request that does not respond', async () => {
	const adapter = createNbpAdapter(
		((_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
			})) as typeof fetch,
		0,
		10
	);
	await assert.rejects(
		() => adapter.latest(),
		(error) => error instanceof DOMException
	);
});

test('dated lookups backfill each missing historical period', async () => {
	const f = await fixture();
	try {
		const requested: string[] = [];
		const rates = createExchangeRateRepository(f.financial.db, {
			async historical(_from, to) {
				requested.push(to);
				return [
					{
						table: 'A',
						no: `${to}/A/NBP`,
						effectiveDate: to,
						rates: [{ code: 'EUR', mid: to.startsWith('2024') ? '4' : '5' }]
					}
				];
			}
		});
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2024-01-15'))?.rateToPln, '4');
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2025-01-15'))?.rateToPln, '4');
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal((await rates.lookup(f.context.workspaceId, 'EUR', '2025-01-15'))?.rateToPln, '5');
		assert.deepEqual(requested, ['2024-01-15', '2025-01-15']);
	} finally {
		await f.close();
	}
});

test('dated lookup records short-gap non-publication coverage', async () => {
	const f = await fixture();
	try {
		let requests = 0;
		const rates = createExchangeRateRepository(f.financial.db, {
			async historical() {
				requests++;
				return [];
			}
		});
		await rates.cacheTables([
			{
				table: 'A',
				no: 'short-gap/A/NBP',
				effectiveDate: '2026-07-31',
				rates: [{ code: 'EUR', mid: '4.2' }]
			}
		]);
		assert.equal(
			(await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02'))?.rateToPln,
			'4.2'
		);
		assert.equal(
			(await rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02'))?.rateToPln,
			'4.2'
		);
		assert.equal(requests, 1);
	} finally {
		await f.close();
	}
});

test('cached dated rates return without waiting for background coverage refresh', async () => {
	const f = await fixture();
	try {
		let requests = 0;
		const rates = createExchangeRateRepository(f.financial.db, {
			async historical() {
				requests++;
				await new Promise((resolve) => setTimeout(resolve, 300));
				return [];
			}
		});
		await rates.cacheTables([
			{
				table: 'A',
				no: 'cached/A/NBP',
				effectiveDate: '2026-07-31',
				rates: [{ code: 'EUR', mid: '4.2' }]
			}
		]);
		const started = Date.now();
		const points = await Promise.all([
			rates.lookup(f.context.workspaceId, 'EUR', '2026-08-01'),
			rates.lookup(f.context.workspaceId, 'EUR', '2026-08-02')
		]);
		assert.ok(Date.now() - started < 150);
		assert.deepEqual(
			points.map((point) => point?.rateToPln),
			['4.2', '4.2']
		);
		assert.equal(requests, 1);
		await new Promise((resolve) => setTimeout(resolve, 320));
	} finally {
		await f.close();
	}
});

test('import transactions must use the account targeted by their batch', async () => {
	const f = await fixture();
	try {
		await f.financial.db.insert(ledgerImportBatch).values({
			id: 'eur-import',
			workspaceId: f.context.workspaceId,
			accountId: 'eur',
			filename: 'transactions.csv',
			actorUserId: 'owner'
		});
		await assert.rejects(
			() =>
				f.financial.db.insert(ledgerTransaction).values({
					id: 'wrong-import-account',
					workspaceId: f.context.workspaceId,
					accountId: 'usd',
					importBatchId: 'eur-import',
					importSourceRow: 1,
					kind: 'expense',
					amountMinor: 100n,
					date: '2026-08-01'
				}),
			(error) => {
				const cause = (error as { cause?: unknown }).cause;
				return cause instanceof Error && /FOREIGN KEY constraint failed/i.test(cause.message);
			}
		);
		await f.financial.db.insert(ledgerTransaction).values({
			id: 'valid-import-account',
			workspaceId: f.context.workspaceId,
			accountId: 'eur',
			importBatchId: 'eur-import',
			importSourceRow: 1,
			kind: 'expense',
			amountMinor: 100n,
			date: '2026-08-01'
		});
		const [imported] = await f.financial.db
			.select()
			.from(ledgerTransaction)
			.where(eq(ledgerTransaction.id, 'valid-import-account'));
		assert.equal(imported.accountId, 'eur');
		assert.equal(imported.importBatchId, 'eur-import');
	} finally {
		await f.close();
	}
});

test('categories enforce workspace, archive and transaction selection rules', async () => {
	const f = await fixture();
	try {
		const unused = await f.repo.createCategory(f.context, {
			name: 'One-off',
			idempotencyKey: 'create-one-off'
		});
		const replay = await f.repo.createCategory(f.context, {
			name: 'One-off',
			idempotencyKey: 'create-one-off'
		});
		assert.deepEqual(replay, unused);
		await assert.rejects(
			() =>
				f.repo.createCategory(f.context, {
					name: 'Different',
					idempotencyKey: 'create-one-off'
				}),
			rejected('conflict')
		);
		await assert.rejects(
			() =>
				f.repo.createCategory(f.context, {
					name: 'one-OFF',
					idempotencyKey: 'unicode-unique'
				}),
			rejected('conflict')
		);
		const archivedResult = await f.repo.categoryAction(f.context, unused.id, 'archive', {
			version: 1,
			idempotencyKey: 'archive-unused'
		});
		assert.deepEqual(
			await f.repo.categoryAction(f.context, unused.id, 'archive', {
				version: 1,
				idempotencyKey: 'archive-unused'
			}),
			archivedResult
		);
		await f.repo.categoryAction(f.context, unused.id, 'restore', {
			version: 2,
			idempotencyKey: 'restore-unused'
		});
		await assert.rejects(
			() =>
				f.repo.categoryAction(f.context, unused.id, 'archive', {
					version: 1,
					idempotencyKey: 'stale-action'
				}),
			rejected('conflict')
		);
		const renamed = await f.repo.updateCategory(f.context, unused.id, {
			name: 'One-time',
			version: 3,
			idempotencyKey: 'rename-one-off'
		});
		assert.equal(renamed.version, 4);
		await assert.rejects(
			() =>
				f.repo.updateCategory(f.context, unused.id, {
					name: 'Stale',
					version: 3,
					idempotencyKey: 'stale-rename'
				}),
			rejected('conflict')
		);
		await f.repo.categoryAction(f.context, unused.id, 'delete', {
			version: 4,
			idempotencyKey: 'delete-unused'
		});
		assert.equal(
			(await f.repo.listCategories(f.context)).some((x) => x.id === unused.id),
			false
		);

		const used = await f.repo.createCategory(f.context, {
			name: 'Used',
			idempotencyKey: 'create-used'
		});
		const created = await f.ledger.createTransaction(f.context, 'eur', {
			idempotencyKey: 'categorized',
			kind: 'expense',
			amountMinor: '10',
			date: '2026-08-01',
			categoryId: used.id
		});
		await assert.rejects(
			() =>
				f.repo.categoryAction(f.context, used.id, 'delete', {
					version: 1,
					idempotencyKey: 'delete-used'
				}),
			rejected('conflict')
		);
		await f.repo.categoryAction(f.context, used.id, 'archive', {
			version: 1,
			idempotencyKey: 'archive-used'
		});
		await assert.rejects(
			() =>
				f.ledger.createTransaction(f.context, 'eur', {
					idempotencyKey: 'archived',
					kind: 'expense',
					amountMinor: '1',
					date: '2026-08-01',
					categoryId: used.id
				}),
			rejected('conflict')
		);
		await f.ledger.updateTransaction(f.context, created.transaction.id, {
			idempotencyKey: 'retain-archived',
			version: 1,
			kind: 'expense',
			amountMinor: '11',
			date: '2026-08-02',
			categoryId: used.id
		});
		assert.equal((await f.ledger.listTransactions(f.context, 'eur'))[0].categoryId, used.id);
		const foreignCategory = (
			await f.db
				.select()
				.from(ledgerCategory)
				.where(eq(ledgerCategory.workspaceId, f.outsiderWorkspaceId))
		)[0];
		await assert.rejects(
			() =>
				f.ledger.createTransaction(f.context, 'eur', {
					idempotencyKey: 'foreign-category',
					kind: 'expense',
					amountMinor: '1',
					date: '2026-08-01',
					categoryId: foreignCategory.id
				}),
			rejected('not_found')
		);
	} finally {
		await f.close();
	}
});

test('summary includes archived cash-flow history and fees while excluding transfers', async () => {
	const f = await fixture();
	try {
		const category = (await f.repo.listCategories(f.context)).find((x) => x.name === 'Salary')!;
		await f.financial.db.insert(ledgerTransfer).values({
			id: 'synthetic',
			sentAmountMinor: 999n,
			receivedAmountMinor: 999n,
			date: '2026-08-03'
		});
		await f.financial.db.insert(ledgerTransaction).values([
			{
				id: 'eur-income',
				workspaceId: f.context.workspaceId,
				accountId: 'eur',
				categoryId: category.id,
				kind: 'income',
				amountMinor: 100n,
				date: '2026-08-02'
			},
			{
				id: 'eur-uncategorized',
				workspaceId: f.context.workspaceId,
				accountId: 'eur',
				kind: 'expense',
				amountMinor: 30n,
				date: '2026-08-03',
				description: 'Transfer fee'
			},
			{
				id: 'usd-expense',
				workspaceId: f.context.workspaceId,
				accountId: 'usd',
				kind: 'expense',
				amountMinor: 50n,
				date: '2026-08-03'
			},
			{
				id: 'outside-date',
				workspaceId: f.context.workspaceId,
				accountId: 'eur',
				kind: 'income',
				amountMinor: 999n,
				date: '2026-07-31'
			},
			{
				id: 'trashed',
				workspaceId: f.context.workspaceId,
				accountId: 'eur',
				kind: 'expense',
				amountMinor: 999n,
				date: '2026-08-03',
				trashedAt: new Date()
			},
			{
				id: 'transfer-side',
				workspaceId: f.context.workspaceId,
				accountId: 'eur',
				kind: 'expense',
				amountMinor: 999n,
				date: '2026-08-03',
				source: 'transfer',
				transferId: 'synthetic',
				transferSide: 'from'
			},
			{
				id: 'foreign-row',
				workspaceId: f.outsiderWorkspaceId,
				accountId: 'foreign',
				kind: 'income',
				amountMinor: 999n,
				date: '2026-08-03'
			}
		]);
		await f.financial.db
			.update(financialAccount)
			.set({ archivedAt: new Date() })
			.where(eq(financialAccount.id, 'eur'));
		const all = await f.repo.summary(f.context, { startDate: '2026-08-01', endDate: '2026-08-31' });
		assert.deepEqual(
			all.currencies.map((x) => [x.currency, x.incomeMinor, x.spendingMinor, x.uncategorizedMinor]),
			[
				['EUR', '100', '30', '30'],
				['USD', '0', '50', '50']
			]
		);
		assert.deepEqual(
			all.currencies
				.flatMap((x) => x.groups.flatMap((g) => g.transactions.map((t) => t.id)))
				.sort(),
			['eur-income', 'eur-uncategorized', 'usd-expense']
		);
		const eur = await f.repo.summary(f.context, {
			startDate: '2026-08-01',
			endDate: '2026-08-31',
			accountIds: ['eur']
		});
		assert.deepEqual(
			eur.currencies.map((x) => x.currency),
			['EUR']
		);
		await assert.rejects(
			() =>
				f.repo.summary(f.context, {
					startDate: '2026-08-01',
					endDate: '2026-08-31',
					accountIds: ['foreign']
				}),
			rejected('not_found')
		);
	} finally {
		await f.close();
	}
});

test('credit-card purchases increase debt and payments stay exact without duplicate spending', async () => {
	const f = await fixture();
	try {
		const groceries = (await f.repo.listCategories(f.context)).find(
			(category) => category.name === 'Groceries'
		)!;
		const eurCard = await f.ledger.createAccount(f.context, {
			idempotencyKey: 'create-eur-card',
			name: 'EUR card',
			type: 'credit_card',
			currency: 'EUR',
			openingDate: '2026-01-01',
			openingBalanceMinor: '0'
		});
		const usdCard = await f.ledger.createAccount(f.context, {
			idempotencyKey: 'create-usd-card',
			name: 'USD card',
			type: 'credit_card',
			currency: 'USD',
			openingDate: '2026-01-01',
			openingBalanceMinor: '0'
		});

		await f.ledger.createTransaction(f.context, eurCard.id, {
			idempotencyKey: 'eur-card-purchase',
			kind: 'expense',
			amountMinor: '700',
			date: '2026-08-02',
			categoryId: groceries.id
		});
		await f.ledger.createTransaction(f.context, usdCard.id, {
			idempotencyKey: 'usd-card-purchase',
			kind: 'expense',
			amountMinor: '1000',
			date: '2026-08-02',
			categoryId: groceries.id
		});
		await f.ledger.createTransfer(f.context, {
			idempotencyKey: 'same-currency-card-payment',
			fromAccountId: 'eur',
			toAccountId: eurCard.id,
			amountMinor: '500',
			date: '2026-08-03'
		});
		await f.ledger.createTransfer(f.context, {
			idempotencyKey: 'cross-currency-card-payment',
			fromAccountId: 'eur',
			toAccountId: usdCard.id,
			amountMinor: '300',
			receivedAmountMinor: '400',
			date: '2026-08-03'
		});

		const accounts = await f.ledger.listAccounts(f.context);
		assert.equal(accounts.find(({ id }) => id === 'eur')?.balanceMinor, '-800');
		assert.equal(accounts.find(({ id }) => id === eurCard.id)?.balanceMinor, '-200');
		assert.equal(accounts.find(({ id }) => id === usdCard.id)?.balanceMinor, '-600');
		const [sameCurrencyPayment] = await f.ledger.listTransfers(f.context, eurCard.id);
		assert.equal(sameCurrencyPayment.sentAmountMinor, '500');
		assert.equal(sameCurrencyPayment.receivedAmountMinor, '500');
		const [crossCurrencyPayment] = await f.ledger.listTransfers(f.context, usdCard.id);
		assert.equal(crossCurrencyPayment.sentAmountMinor, '300');
		assert.equal(crossCurrencyPayment.receivedAmountMinor, '400');
		const summary = await f.repo.summary(f.context, {
			startDate: '2026-08-01',
			endDate: '2026-08-31'
		});
		assert.deepEqual(
			summary.currencies.map(({ currency, incomeMinor, spendingMinor }) => ({
				currency,
				incomeMinor,
				spendingMinor
			})),
			[
				{ currency: 'EUR', incomeMinor: '0', spendingMinor: '700' },
				{ currency: 'USD', incomeMinor: '0', spendingMinor: '1000' }
			]
		);
		assert.deepEqual(
			summary.currencies.map(({ groups }) => groups[0]?.categoryName),
			['Groceries', 'Groceries']
		);
	} finally {
		await f.close();
	}
});

test('CSV preview diagnoses rows and confirm is atomic with provenance, categories and trash audit', async () => {
	const f = await fixture();
	try {
		const salary = (await f.repo.listCategories(f.context)).find((x) => x.name === 'Salary')!;
		const archived = await f.repo.createCategory(f.context, {
			name: 'Archived CSV',
			idempotencyKey: 'create-archived-csv'
		});
		await f.financial.db.insert(ledgerTransaction).values({
			id: 'use-archived',
			workspaceId: f.context.workspaceId,
			accountId: 'eur',
			categoryId: archived.id,
			kind: 'expense',
			amountMinor: 1n,
			date: '2026-07-01'
		});
		await f.repo.categoryAction(f.context, archived.id, 'archive', {
			version: 1,
			idempotencyKey: 'archive-csv'
		});
		await f.financial.db.insert(ledgerTransaction).values({
			id: 'existing',
			workspaceId: f.context.workspaceId,
			accountId: 'eur',
			kind: 'expense',
			amountMinor: 1234n,
			date: '2026-08-01',
			description: 'Quoted, value'
		});
		const csv =
			'date,kind,amount,description,category\n2026-08-01,expense,12.34,"Quoted, value",Salary\n2026-08-02,income,20.00,Pay,Salary\n2026-08-02,income,20.00,Pay,Unknown\n2026-08-03,expense,3.00,Old,Archived CSV\nnot-a-date,bad,0,x,';
		const preview = await f.repo.preview(f.context, {
			filename: 'bank.csv',
			accountId: 'eur',
			csv
		});
		assert.equal(preview.rows[0].duplicateReason !== null, true);
		assert.equal(preview.rows[1].categoryStatus, 'existing');
		assert.equal(preview.rows[2].duplicateReason !== null, true);
		assert.equal(preview.rows[2].categoryStatus, 'unknown');
		assert.equal(preview.rows[3].categoryStatus, 'archived');
		assert.ok(preview.rows[4].errors.length >= 3);

		const importCsv =
			'date,kind,amount,description,category\n2026-08-01,income,10.00,Matched,Unknown\n2026-08-02,expense,2.00,Created,New one\n2026-08-03,expense,1.00,Blank,';
		const batch = await f.repo.confirm(f.context, {
			idempotencyKey: 'confirm-source',
			filename: 'source.csv',
			accountId: 'eur',
			csv: importCsv,
			rows: [
				{ sourceRow: 2, include: true, duplicateAcknowledged: false, categoryId: salary.id },
				{ sourceRow: 3, include: true, duplicateAcknowledged: false, createCategory: 'New one' },
				{ sourceRow: 4, include: true, duplicateAcknowledged: false }
			]
		});
		const retried = await f.repo.confirm(f.context, {
			idempotencyKey: 'confirm-source',
			filename: 'source.csv',
			accountId: 'eur',
			csv: importCsv,
			rows: [
				{ sourceRow: 2, include: true, duplicateAcknowledged: false, categoryId: salary.id },
				{ sourceRow: 3, include: true, duplicateAcknowledged: false, createCategory: 'New one' },
				{ sourceRow: 4, include: true, duplicateAcknowledged: false }
			]
		});
		assert.deepEqual(retried, batch);
		const [receipt] = await f.financial.db
			.select()
			.from(mutationReceipt)
			.where(eq(mutationReceipt.idempotencyKey, 'confirm-source'));
		assert.equal(receipt.requestJson.includes(importCsv), false);
		assert.match(receipt.requestJson, /csvSha256/);
		assert.equal(batch.actorUserId, 'owner');
		assert.equal(batch.filename, 'source.csv');
		assert.equal(batch.count, 3);
		const detail = await f.repo.importDetail(f.context, batch.id);
		assert.deepEqual(detail.transactions.map((x) => x.importSourceRow).sort(), [2, 3, 4]);
		assert.equal(detail.transactions.find((x) => x.importSourceRow === 2)!.categoryId, salary.id);
		assert.equal(detail.transactions.find((x) => x.importSourceRow === 4)!.categoryId, null);
		assert.ok(
			(
				await f.financial.db.select().from(financialAccount).where(eq(financialAccount.id, 'eur'))
			)[0].activityStartedAt
		);
		assert.equal(
			(await f.financial.db.select().from(ledgerAudit)).filter((x) => x.actorUserId === 'owner')
				.length >= 5,
			true
		);

		await f.client.execute(
			"CREATE TRIGGER fail_late_import BEFORE INSERT ON ledger_transaction WHEN NEW.import_source_row=3 BEGIN SELECT RAISE(ABORT,'late failure'); END"
		);
		const before = {
			batches: (await f.financial.db.select().from(ledgerImportBatch)).length,
			transactions: (await f.financial.db.select().from(ledgerTransaction)).length,
			categories: (await f.financial.db.select().from(ledgerCategory)).length
		};
		await assert.rejects(() =>
			f.repo.confirm(f.context, {
				idempotencyKey: 'confirm-failure',
				filename: 'fail.csv',
				accountId: 'eur',
				csv: importCsv,
				rows: [
					{
						sourceRow: 2,
						include: true,
						duplicateAcknowledged: false,
						createCategory: 'Rolled back'
					},
					{ sourceRow: 3, include: true, duplicateAcknowledged: false }
				]
			})
		);
		assert.deepEqual(
			{
				batches: (await f.financial.db.select().from(ledgerImportBatch)).length,
				transactions: (await f.financial.db.select().from(ledgerTransaction)).length,
				categories: (await f.financial.db.select().from(ledgerCategory)).length
			},
			before
		);

		const already = detail.transactions[0];
		await f.financial.db
			.update(ledgerTransaction)
			.set({ trashedAt: new Date('2026-08-01'), version: 2 })
			.where(eq(ledgerTransaction.id, already.id));
		assert.deepEqual(await f.repo.trashImport(f.context, batch.id, 'trash-source'), { trashed: 2 });
		const [batchAudit] = await f.financial.db
			.select()
			.from(ledgerAudit)
			.where(and(eq(ledgerAudit.entityId, batch.id), eq(ledgerAudit.action, 'trash')));
		assert.equal(JSON.parse(batchAudit.beforeJson!).trashedAt, null);
		assert.match(JSON.parse(batchAudit.afterJson!).trashedAt, /^\d{4}-\d{2}-\d{2}T/);
		const after = await f.repo.importDetail(f.context, batch.id);
		assert.equal(
			after.transactions.every((x) => x.trashedAt),
			true
		);
		assert.equal(after.transactions.find((x) => x.id === already.id)!.version, 2);
		await assert.rejects(
			() =>
				f.repo.trashImport(
					{ userId: 'outsider', workspaceId: f.context.workspaceId },
					batch.id,
					'trash-outsider'
				),
			rejected('not_found')
		);
		await assert.rejects(
			() =>
				f.repo.trashImport(
					{ userId: 'owner', workspaceId: f.outsiderWorkspaceId },
					batch.id,
					'trash-foreign'
				),
			rejected('not_found')
		);
	} finally {
		await f.close();
	}
});
