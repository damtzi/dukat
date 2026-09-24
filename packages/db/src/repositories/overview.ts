import { todayInDefaultTimeZone, type MyOverview, type Summary } from '@dukat/core';

import type { createExchangeRateRepository } from './exchange-rates';
import type { InsightsRepository } from './insights';
import type { LedgerRepository } from './ledger';
import type { PlanningRepository } from './planning';

type WorkspaceRepository = {
	listAuthorized(userId: string): Promise<
		Array<{
			id: string;
			name: string;
			type: 'personal' | 'household';
			reportingCurrency: string | null;
		}>
	>;
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

function shiftMonth(month: string, offset: number) {
	const [year, value] = month.split('-').map(Number) as [number, number];
	const shifted = new Date(Date.UTC(year, value - 1 + offset, 1));
	return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function summaryBetween(summary: Summary, startDate: string, endDate: string): Summary {
	return {
		currencies: summary.currencies
			.map((source) => {
				const groups = source.groups
					.map((group) => {
						const transactions = group.transactions.filter(
							(transaction) => transaction.date >= startDate && transaction.date <= endDate
						);
						return {
							...group,
							amountMinor: transactions
								.reduce((sum, transaction) => sum + BigInt(transaction.amountMinor), 0n)
								.toString(),
							transactions
						};
					})
					.filter((group) => group.transactions.length > 0);
				const amount = (kind: 'income' | 'expense') =>
					groups
						.filter((group) => group.kind === kind)
						.reduce((sum, group) => sum + BigInt(group.amountMinor), 0n)
						.toString();
				return {
					currency: source.currency,
					incomeMinor: amount('income'),
					spendingMinor: amount('expense'),
					uncategorizedMinor: groups
						.filter((group) => group.categoryId === null)
						.reduce((sum, group) => sum + BigInt(group.amountMinor), 0n)
						.toString(),
					groups
				};
			})
			.filter((source) => source.groups.length > 0)
	};
}

function total(workspaces: Array<{ availableMoneyMinor: string | null; missingRate: boolean }>) {
	const missingRate = workspaces.some((workspace) => workspace.missingRate);
	return {
		amountMinor: missingRate
			? null
			: workspaces
					.reduce((sum, workspace) => sum + BigInt(workspace.availableMoneyMinor ?? '0'), 0n)
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
	return {
		async get(userId: string): Promise<MyOverview> {
			const workspaces = await dependencies.workspaces.listAuthorized(userId);
			const reportingCurrency =
				workspaces.find(({ type }) => type === 'personal')?.reportingCurrency ?? 'PLN';
			const today = todayInDefaultTimeZone(dependencies.clock?.() ?? new Date());
			const range = monthRange(today);
			const currentMonth = today.slice(0, 7);
			const typicalMonths = [-3, -2, -1].map((offset) => shiftMonth(currentMonth, offset));
			const comparisonStart = `${typicalMonths[0]}-01`;
			const originalSpending = new Map<string, bigint>();
			const accountRows: MyOverview['accounts'] = [];
			const recentTransactions: Array<
				MyOverview['recentTransactions'][number] & { createdAt: string }
			> = [];
			const upcoming: MyOverview['upcoming'] = [];
			const spendingByDate = new Map<string, bigint>();
			let spending = 0n;
			let spendingMissingRate = false;
			let comparisonMissingRate = false;

			const workspaceRows = [];
			for (const workspace of workspaces) {
				const context = { userId, workspaceId: workspace.id };
				const categories = await dependencies.insights.listCategories(context);
				const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
				const balances = await dependencies.exchangeRates.currentBalances<LedgerAccount>(
					userId,
					workspace.id,
					dependencies.ledger,
					reportingCurrency,
					undefined,
					(account) =>
						account.type === 'current' || account.type === 'savings' || account.type === 'cash'
				);
				const comparisonSummary = await dependencies.insights.summary(context, {
					startDate: comparisonStart,
					endDate: today
				});
				const summary = summaryBetween(comparisonSummary, range.startDate, today);
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
						creditLimitMinor: account.creditLimitMinor,
						statementDate: account.statementDate,
						paymentDueDate: account.paymentDueDate,
						paymentDueMinor: account.paymentDueMinor,
						paymentStatus: account.paymentStatus,
						archivedAt: account.archivedAt
					}))
				);

				const convertedSpending = await dependencies.exchangeRates.reportingTotals(
					workspace.id,
					comparisonSummary.currencies.flatMap((source) =>
						source.groups
							.filter((group) => group.kind === 'expense')
							.flatMap((group) =>
								group.transactions.map((transaction) => ({
									group: transaction.date,
									amountMinor: transaction.amountMinor,
									currency: source.currency,
									date: transaction.date
								}))
							)
					),
					reportingCurrency
				);
				if (convertedSpending.missingRate) comparisonMissingRate = true;
				else
					for (const entry of convertedSpending.totals)
						spendingByDate.set(
							entry.group,
							(spendingByDate.get(entry.group) ?? 0n) + BigInt(entry.amountMinor)
						);

				const latest = await dependencies.ledger.searchTransactions(context, { limit: 200 });
				for (const transaction of latest.filter(({ kind }) => kind !== 'refund').slice(0, 5)) {
					const account = accounts.find(({ id }) => id === transaction.accountId);
					if (!account) continue;
					recentTransactions.push({
						id: transaction.id,
						workspaceId: workspace.id,
						workspaceName: workspace.name,
						workspaceType: workspace.type,
						accountId: account.id,
						accountName: account.name,
						kind: transaction.kind,
						amountMinor: transaction.amountMinor,
						currency: account.currency,
						date: transaction.date,
						merchant: transaction.merchant,
						description: transaction.description,
						categoryName: transaction.categoryId
							? (categoryNames.get(transaction.categoryId) ?? null)
							: null,
						createdAt: transaction.createdAt
					});
				}

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
					availableMoneyMinor: balances.totalMinor,
					missingRate: balances.missingRate
				});
			}

			const personal = workspaceRows.filter(({ type }) => type === 'personal');
			const household = workspaceRows.filter(({ type }) => type === 'household');
			const asOfDay = Number(today.slice(-2));
			const daysInCurrentMonth = Number(monthRange(today).endDate.slice(-2));
			const cumulative = (month: string, day: number) => {
				const daysInMonth = Number(monthRange(`${month}-01`).endDate.slice(-2));
				let amount = 0n;
				for (let index = 1; index <= Math.min(day, daysInMonth); index += 1)
					amount += spendingByDate.get(`${month}-${String(index).padStart(2, '0')}`) ?? 0n;
				return amount;
			};
			const points = Array.from({ length: daysInCurrentMonth }, (_, index) => {
				const day = index + 1;
				return {
					day,
					currentAmountMinor: day <= asOfDay ? cumulative(currentMonth, day).toString() : null,
					typicalAmountMinor: (
						typicalMonths.reduce((sum, month) => sum + cumulative(month, day), 0n) / 3n
					).toString()
				};
			});
			const currentAsOf = cumulative(currentMonth, asOfDay);
			const typicalAsOf =
				typicalMonths.reduce((sum, month) => sum + cumulative(month, asOfDay), 0n) / 3n;
			const cardObligations = accountRows
				.filter(
					(account) =>
						account.type === 'credit_card' &&
						account.paymentDueMinor !== null &&
						BigInt(account.paymentDueMinor) > 0n
				)
				.map((account) => ({
					accountId: account.id,
					workspaceId: account.workspaceId,
					workspaceName: account.workspaceName,
					accountName: account.name,
					currency: account.currency,
					amountMinor: account.paymentDueMinor!,
					statementDate: account.statementDate,
					paymentDueDate: account.paymentDueDate,
					status: account.paymentStatus!
				}))
				.sort(
					(left, right) =>
						(left.paymentDueDate ?? '9999-12-31').localeCompare(
							right.paymentDueDate ?? '9999-12-31'
						) || left.accountName.localeCompare(right.accountName)
				);
			return {
				reportingCurrency,
				personalAvailableMoney: total(personal),
				householdAvailableMoney: total(household),
				availableMoney: total(workspaceRows),
				currentMonthSpending: {
					amountMinor: spendingMissingRate ? null : spending.toString(),
					missingRate: spendingMissingRate,
					originals: [...originalSpending]
						.sort(([left], [right]) => left.localeCompare(right))
						.map(([currency, amountMinor]) => ({ currency, amountMinor: amountMinor.toString() }))
				},
				spendingComparison: {
					currentMonth,
					typicalMonths,
					asOfDay,
					missingRate: comparisonMissingRate,
					differenceMinor: comparisonMissingRate ? null : (typicalAsOf - currentAsOf).toString(),
					points: comparisonMissingRate
						? points.map((point) => ({
								...point,
								currentAmountMinor: null,
								typicalAmountMinor: '0'
							}))
						: points
				},
				recentTransactions: recentTransactions
					.sort(
						(left, right) =>
							right.date.localeCompare(left.date) ||
							right.createdAt.localeCompare(left.createdAt) ||
							right.id.localeCompare(left.id)
					)
					.slice(0, 5)
					.map(({ createdAt: _, ...transaction }) => transaction),
				accounts: accountRows,
				cardObligations,
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
