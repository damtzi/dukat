import { todayInDefaultTimeZone } from '@dukat/core';
import { netWorthHistoryPointSchema, type NetWorthHistoryPoint } from '@dukat/core/overview';
import { and, eq } from 'drizzle-orm';

import type { FinancialDatabase } from '../connection';
import { netWorthSnapshot, user } from '../schema';
import type { createExchangeRateRepository } from './exchange-rates';
import type { LedgerRepository } from './ledger';

type WorkspaceRepository = {
	listAuthorized(
		userId: string
	): Promise<Array<{ id: string; name: string; type: 'personal' | 'household' }>>;
};
type LedgerAccount = Awaited<ReturnType<LedgerRepository['listAccounts']>>[number];

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

export function createNetWorthHistoryRepository(dependencies: {
	database: FinancialDatabase;
	workspaces: WorkspaceRepository;
	ledger: LedgerRepository;
	exchangeRates: ReturnType<typeof createExchangeRateRepository>;
}) {
	const reportingCurrency = 'PLN';
	return {
		async recordUser(userId: string, date: string) {
			const [existing] = await dependencies.database
				.select({ id: netWorthSnapshot.id })
				.from(netWorthSnapshot)
				.where(and(eq(netWorthSnapshot.userId, userId), eq(netWorthSnapshot.date, date)))
				.limit(1);
			if (existing) return false;
			const workspaces = await dependencies.workspaces.listAuthorized(userId);
			const workspaceRows: NetWorthHistoryPoint['workspaces'] = [];
			for (const workspace of workspaces) {
				const balances = await dependencies.exchangeRates.currentBalances<LedgerAccount>(
					userId,
					workspace.id,
					dependencies.ledger,
					reportingCurrency,
					date
				);
				workspaceRows.push({
					id: workspace.id,
					name: workspace.name,
					type: workspace.type,
					netWorthMinor: balances.totalMinor,
					missingRate: balances.missingRate,
					accounts: balances.accounts.map((account) => ({
						id: account.id,
						name: account.name,
						type: account.type,
						currency: account.currency,
						balanceMinor: account.balanceMinor,
						convertedBalanceMinor: account.convertedBalanceMinor,
						rates: account.rates
					}))
				});
			}
			const personal = workspaceRows.filter(({ type }) => type === 'personal');
			const household = workspaceRows.filter(({ type }) => type === 'household');
			const payload = netWorthHistoryPointSchema.parse({
				date,
				reportingCurrency,
				personalNetWorth: total(personal),
				householdNetWorth: total(household),
				combinedNetWorth: total(workspaceRows),
				workspaces: workspaceRows
			});
			const inserted = await dependencies.database
				.insert(netWorthSnapshot)
				.values({
					id: crypto.randomUUID(),
					userId,
					date,
					payloadJson: JSON.stringify(payload)
				})
				.onConflictDoNothing()
				.returning({ id: netWorthSnapshot.id });
			return inserted.length === 1;
		},
		async recordAll(date = todayInDefaultTimeZone()) {
			const users = await dependencies.database.select({ id: user.id }).from(user);
			const failures: Array<{ userId: string; error: unknown }> = [];
			for (const row of users) {
				try {
					await this.recordUser(row.id, date);
				} catch (error) {
					failures.push({ userId: row.id, error });
				}
			}
			return failures;
		},
		async list(userId: string) {
			const rows = await dependencies.database
				.select({ payloadJson: netWorthSnapshot.payloadJson })
				.from(netWorthSnapshot)
				.where(eq(netWorthSnapshot.userId, userId))
				.orderBy(netWorthSnapshot.date);
			return rows.map(({ payloadJson }) =>
				netWorthHistoryPointSchema.parse(JSON.parse(payloadJson))
			);
		}
	};
}

export type NetWorthHistoryRepository = ReturnType<typeof createNetWorthHistoryRepository>;
