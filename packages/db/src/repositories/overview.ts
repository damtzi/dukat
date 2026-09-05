import { todayInDefaultTimeZone, type MyOverview, type Summary } from '@dukat/core';

import type { createExchangeRateRepository } from './exchange-rates';
import type { InsightsRepository } from './insights';
import type { LedgerRepository } from './ledger';
import type { PlanningRepository } from './planning';

type WorkspaceRepository = {
	listAuthorized(
		userId: string
	): Promise<Array<{ id: string; name: string; type: 'personal' | 'household' }>>;
};
type LedgerAccount = Awaited<ReturnType<LedgerRepository['listAccounts']>>[number];
type AccountForecast = Awaited<ReturnType<PlanningRepository['accountForecast']>>;

function monthRange(date: string) {
	const [year, month] = date.split('-').map(Number) as [number, number];
	const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		startDate: `${date.slice(0, 7)}-01`,
		endDate: `${date.slice(0, 7)}-${String(end).padStart(2, '0')}`
	};
}

function total(workspaces: Array<{ netWorthMinor: string | null; missingRate: boolean }>) {
	const missingRate = workspaces.some((workspace) => workspace.missingRate);
	return {
		amountMinor: missingRate
			? null
			: workspaces
					.reduce((sum, workspace) => sum + BigInt(workspace.netWorthMinor ?? '0'), 0n)
					.toString(),
		missingRate
	};
}

export function createOverviewRepository(dependencies: {
	workspaces: WorkspaceRepository;
	ledger: LedgerRepository;
	planning: PlanningRepository;
	insights: InsightsRepository;
	exchangeRates: ReturnType<typeof createExchangeRateRepository>;
	clock?: () => Date;
}) {
	const reportingCurrency = 'PLN';
	return {
		async get(userId: string): Promise<MyOverview> {
			const workspaces = await dependencies.workspaces.listAuthorized(userId);
			const range = monthRange(todayInDefaultTimeZone(dependencies.clock?.() ?? new Date()));
			const originalSpending = new Map<string, bigint>();
			const accountRows: MyOverview['accounts'] = [];
			const upcoming: MyOverview['upcoming'] = [];
			let spending = 0n;
			let spendingMissingRate = false;

			const workspaceRows = [];
			for (const workspace of workspaces) {
				const context = { userId, workspaceId: workspace.id };
				const balances = await dependencies.exchangeRates.currentBalances<LedgerAccount>(
					userId,
					workspace.id,
					dependencies.ledger,
					reportingCurrency
				);
				const summary = await dependencies.insights.summary(context, range);
				const accounts = balances.accounts;
				const reporting = await dependencies.exchangeRates.reportingSummary(
					workspace.id,
					summary as Summary,
					reportingCurrency
				);
				for (const source of (summary as Summary).currencies)
					originalSpending.set(
						source.currency,
						(originalSpending.get(source.currency) ?? 0n) + BigInt(source.spendingMinor)
					);
				if (reporting.reporting.missingRate) spendingMissingRate = true;
				else spending += BigInt(reporting.reporting.spendingMinor!);

				accountRows.push(
					...accounts.map((account) => ({
						id: account.id,
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						workspaceType: workspace.type,
						name: account.name,
						type: account.type,
						currency: account.currency,
						balanceMinor: account.balanceMinor,
						convertedBalanceMinor: account.convertedBalanceMinor,
						archivedAt: account.archivedAt?.toISOString() ?? null
					}))
				);

				const forecasts = [];
				for (const account of accounts)
					forecasts.push(await dependencies.planning.accountForecast(context, account.id, false));
				const convertedForecast = await dependencies.exchangeRates.workspaceForecast(
					userId,
					workspace.id,
					forecasts,
					reportingCurrency
				);
				const convertedByOccurrence = new Map(
					convertedForecast.occurrences.map((occurrence) => [
						`${occurrence.accountId}:${occurrence.planId}:${occurrence.originalDate}`,
						occurrence.amountMinor
					])
				);
				for (const forecast of forecasts as AccountForecast[]) {
					const account = accounts.find(({ id }) => id === forecast.id)!;
					for (const occurrence of forecast.occurrences) {
						upcoming.push({
							workspaceId: workspace.id,
							workspaceName: workspace.name,
							workspaceType: workspace.type,
							accountId: account.id,
							accountName: account.name,
							planId: occurrence.planId,
							date: occurrence.date,
							kind: occurrence.kind,
							currency: account.currency,
							amountMinor: occurrence.amountMinor,
							convertedAmountMinor:
								convertedByOccurrence.get(
									`${account.id}:${occurrence.planId}:${occurrence.originalDate}`
								) ?? null
						});
					}
				}

				workspaceRows.push({
					id: workspace.id,
					name: workspace.name,
					type: workspace.type,
					netWorthMinor: balances.totalMinor,
					missingRate: balances.missingRate
				});
			}

			const personal = workspaceRows.filter(({ type }) => type === 'personal');
			const household = workspaceRows.filter(({ type }) => type === 'household');
			return {
				reportingCurrency,
				personalNetWorth: total(personal),
				householdNetWorth: total(household),
				combinedNetWorth: total(workspaceRows),
				currentMonthSpending: {
					amountMinor: spendingMissingRate ? null : spending.toString(),
					missingRate: spendingMissingRate,
					originals: [...originalSpending]
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([currency, amountMinor]) => ({ currency, amountMinor: amountMinor.toString() }))
				},
				accounts: accountRows,
				upcoming: upcoming.sort(
					(left, right) =>
						left.date.localeCompare(right.date) ||
						`${left.workspaceId}:${left.planId}`.localeCompare(
							`${right.workspaceId}:${right.planId}`
						)
				),
				workspaces: workspaceRows
			};
		}
	};
}

export type OverviewRepository = ReturnType<typeof createOverviewRepository>;
