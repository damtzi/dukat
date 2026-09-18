import assert from 'node:assert/strict';
import test from 'node:test';

import type { Summary } from '@dukat/core';

import { createOverviewRepository } from './overview';

const total = { amountMinor: '0', missingRate: false };

function summary(transactions: Summary['currencies'][number]['groups'][number]['transactions'][]) {
	const rows = transactions.flat();
	return {
		currencies: [
			{
				currency: 'PLN',
				incomeMinor: '0',
				spendingMinor: rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n).toString(),
				uncategorizedMinor: '0',
				groups: [
					{
						kind: 'expense' as const,
						categoryId: 'groceries',
						categoryName: 'Groceries',
						amountMinor: rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n).toString(),
						transactions: rows
					}
				]
			}
		]
	} satisfies Summary;
}

const expense = (id: string, date: string, amountMinor: string) => ({
	id,
	accountId: 'everyday',
	date,
	kind: 'expense' as const,
	amountMinor,
	description: id
});

test('overview compares current cumulative spending with the previous three complete months', async () => {
	const spending = summary([
		[
			expense('june-1', '2026-06-01', '100'),
			expense('june-18', '2026-06-18', '200'),
			expense('july-2', '2026-07-02', '600'),
			expense('august-18', '2026-08-18', '900'),
			expense('september-1', '2026-09-01', '100'),
			expense('september-18', '2026-09-18', '200')
		]
	]);
	const repo = createOverviewRepository({
		workspaces: {
			async listAuthorized() {
				return [{ id: 'personal', name: 'Personal', type: 'personal' as const }];
			}
		},
		ledger: {
			async listAccounts() {
				return [];
			},
			async searchTransactions() {
				return [];
			}
		} as never,
		planning: {
			async accountForecast() {
				throw new Error('No accounts');
			}
		} as never,
		insights: {
			async listCategories() {
				return [];
			},
			async summary() {
				return spending;
			}
		} as never,
		exchangeRates: {
			async currentBalances() {
				return { accounts: [], totalMinor: '0', missingRate: false, rates: [] };
			},
			async reportingSummary(_workspaceId: string, value: Summary) {
				const amount = value.currencies
					.flatMap((currency) => currency.groups)
					.flatMap((group) => group.transactions)
					.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
				return {
					...value,
					reporting: {
						currency: 'PLN',
						incomeMinor: '0',
						spendingMinor: amount.toString(),
						uncategorizedMinor: '0',
						missingRate: false,
						rates: []
					}
				};
			},
			async reportingTotals(
				_workspaceId: string,
				entries: Array<{ group: string; amountMinor: string }>
			) {
				const grouped = new Map<string, bigint>();
				for (const entry of entries)
					grouped.set(entry.group, (grouped.get(entry.group) ?? 0n) + BigInt(entry.amountMinor));
				return {
					reportingCurrency: 'PLN',
					missingRate: false,
					totals: [...grouped].map(([group, amount]) => ({
						group,
						amountMinor: amount.toString()
					}))
				};
			},
			async workspaceForecast() {
				return { occurrences: [] };
			}
		} as never,
		history: {
			async list() {
				return [];
			}
		},
		clock: () => new Date('2026-09-18T12:00:00Z')
	});

	const overview = await repo.get('owner');
	assert.deepEqual(overview.spendingComparison.typicalMonths, ['2026-06', '2026-07', '2026-08']);
	assert.equal(overview.spendingComparison.asOfDay, 18);
	assert.equal(overview.spendingComparison.missingRate, false);
	assert.deepEqual(
		overview.spendingComparison.points.find(({ day }) => day === 18),
		{
			day: 18,
			currentAmountMinor: '300',
			typicalAmountMinor: '600'
		}
	);
	assert.equal(overview.spendingComparison.differenceMinor, '300');
	assert.deepEqual(overview.currentMonthSpending, {
		amountMinor: '300',
		missingRate: false,
		originals: [{ currency: 'PLN', amountMinor: '300' }]
	});
	assert.deepEqual(overview.combinedNetWorth, total);
});

test('overview returns the five newest income and expense transactions across accessible workspaces', async () => {
	const transaction = (
		id: string,
		date: string,
		accountId: string,
		kind: 'income' | 'expense' | 'refund' = 'expense'
	) => ({
		id,
		workspaceId: accountId === 'shared-account' ? 'shared' : 'personal',
		accountId,
		kind,
		amountMinor: '1250',
		date,
		merchant: id,
		description: null,
		categoryId: id === 'personal-new' ? 'groceries' : null,
		refundOfTransactionId: null,
		source: 'manual' as const,
		version: 1,
		trashedAt: null,
		createdAt: `${date}T12:00:00.000Z`,
		updatedAt: `${date}T12:00:00.000Z`
	});
	const workspaces = [
		{ id: 'personal', name: 'Personal', type: 'personal' as const },
		{ id: 'shared', name: 'Home', type: 'household' as const }
	];
	const repo = createOverviewRepository({
		workspaces: {
			async listAuthorized() {
				return workspaces;
			}
		},
		ledger: {
			async searchTransactions(context: { workspaceId: string }) {
				return context.workspaceId === 'personal'
					? [
							transaction('newest-refund', '2026-09-19', 'personal-account', 'refund'),
							transaction('personal-new', '2026-09-18', 'personal-account'),
							transaction('personal-old', '2026-09-10', 'personal-account')
						]
					: [
							transaction('shared-new', '2026-09-17', 'shared-account'),
							transaction('shared-2', '2026-09-16', 'shared-account'),
							transaction('shared-3', '2026-09-15', 'shared-account'),
							transaction('shared-4', '2026-09-14', 'shared-account'),
							transaction('shared-5', '2026-09-13', 'shared-account')
						];
			}
		} as never,
		planning: {
			async accountForecast(_context: unknown, accountId: string) {
				return {
					id: accountId,
					currency: 'PLN',
					startingBalanceMinor: '0',
					endingBalanceMinor: '0',
					occurrences: []
				};
			}
		} as never,
		insights: {
			async listCategories(context: { workspaceId: string }) {
				return context.workspaceId === 'personal' ? [{ id: 'groceries', name: 'Groceries' }] : [];
			},
			async summary() {
				return { currencies: [] };
			}
		} as never,
		exchangeRates: {
			async currentBalances(_userId: string, workspaceId: string) {
				return {
					accounts: [
						{
							id: workspaceId === 'personal' ? 'personal-account' : 'shared-account',
							name: workspaceId === 'personal' ? 'Everyday' : 'Joint',
							type: 'current',
							currency: 'PLN',
							balanceMinor: '0',
							convertedBalanceMinor: '0',
							archivedAt: null
						}
					],
					totalMinor: '0',
					missingRate: false,
					rates: []
				};
			},
			async reportingSummary(_workspaceId: string, value: Summary) {
				return {
					...value,
					reporting: {
						currency: 'PLN',
						incomeMinor: '0',
						spendingMinor: '0',
						uncategorizedMinor: '0',
						missingRate: false,
						rates: []
					}
				};
			},
			async reportingTotals() {
				return { reportingCurrency: 'PLN', missingRate: false, totals: [] };
			},
			async workspaceForecast() {
				return { occurrences: [] };
			}
		} as never,
		history: {
			async list() {
				return [];
			}
		},
		clock: () => new Date('2026-09-18T12:00:00Z')
	});

	const overview = await repo.get('owner');
	assert.deepEqual(
		overview.recentTransactions.map(({ id, workspaceName, accountName, categoryName }) => ({
			id,
			workspaceName,
			accountName,
			categoryName
		})),
		[
			{
				id: 'personal-new',
				workspaceName: 'Personal',
				accountName: 'Everyday',
				categoryName: 'Groceries'
			},
			{ id: 'shared-new', workspaceName: 'Home', accountName: 'Joint', categoryName: null },
			{ id: 'shared-2', workspaceName: 'Home', accountName: 'Joint', categoryName: null },
			{ id: 'shared-3', workspaceName: 'Home', accountName: 'Joint', categoryName: null },
			{ id: 'shared-4', workspaceName: 'Home', accountName: 'Joint', categoryName: null }
		]
	);
});
