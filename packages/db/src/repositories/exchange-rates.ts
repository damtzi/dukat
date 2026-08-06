import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Summary } from '@dukat/core/csv-import';
import {
	addRational,
	convertMinorRational,
	polishBusinessDaysAfter,
	roundRational,
	todayInWarsaw,
	type Rational,
	type ManualRateInput
} from '@dukat/core/exchange-rates';
import type { FinancialDatabase } from '../connection';
import {
	exchangeRate,
	exchangeRateFetch,
	exchangeRateTable,
	user,
	workspace,
	workspaceManualRate,
	workspaceMembership
} from '../schema';

export interface NbpTable {
	table: string;
	no: string;
	effectiveDate: string;
	rates: Array<{ code: string; mid: number | string }>;
}

export function createNbpAdapter(fetcher: typeof fetch = fetch, retries = 1, timeoutMs = 1_500) {
	const request = async (url: string) => {
		let last: unknown;
		for (let attempt = 0; attempt <= retries; attempt++) {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await fetcher(url, {
					headers: { Accept: 'application/json' },
					signal: controller.signal
				});
				if (response.status === 404) return [];
				if (!response.ok) throw new Error(`NBP returned ${response.status}`);
				return (await response.json()) as NbpTable[];
			} catch (error) {
				last = error;
				if (attempt < retries)
					await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
			} finally {
				clearTimeout(timeout);
			}
		}
		throw last;
	};
	return {
		latest: () => request('https://api.nbp.pl/api/exchangerates/tables/A/?format=json'),
		async historical(from: string, to: string) {
			const output: NbpTable[] = [];
			let cursor = new Date(`${from}T00:00:00Z`);
			const end = new Date(`${to}T00:00:00Z`);
			while (cursor <= end) {
				const windowEnd = new Date(Math.min(end.getTime(), cursor.getTime() + 92 * 86_400_000));
				const date = (value: Date) => value.toISOString().slice(0, 10);
				output.push(
					...(await request(
						`https://api.nbp.pl/api/exchangerates/tables/A/${date(cursor)}/${date(windowEnd)}/?format=json`
					))
				);
				cursor = new Date(windowEnd.getTime() + 86_400_000);
			}
			return output;
		}
	};
}

export function createExchangeRateRepository(
	database: FinancialDatabase,
	nbp?: Partial<Pick<ReturnType<typeof createNbpAdapter>, 'historical' | 'latest'>>
) {
	let historicalRefresh: Promise<void> | undefined;
	let historicalFailureUntil = 0;
	let latestRefresh: Promise<void> | undefined;
	let latestFailureUntil = 0;
	const authorized = async (userId: string, workspaceId: string) => {
		const [found] = await database
			.select({ id: workspace.id })
			.from(workspace)
			.leftJoin(
				workspaceMembership,
				and(
					eq(workspaceMembership.workspaceId, workspace.id),
					eq(workspaceMembership.userId, userId)
				)
			)
			.where(
				and(
					eq(workspace.id, workspaceId),
					isNull(workspace.deletedAt),
					or(eq(workspace.personalOwnerUserId, userId), eq(workspaceMembership.userId, userId))
				)
			)
			.limit(1);
		if (!found) throw Object.assign(new Error('Workspace not found'), { code: 'not_found' });
	};
	const cacheTables = async (tables: NbpTable[], fetchedAt = new Date()) =>
		database.transaction(async (tx) => {
			for (const table of tables) {
				await tx
					.insert(exchangeRateTable)
					.values({
						source: 'NBP',
						tableType: table.table,
						tableNumber: table.no,
						effectiveDate: table.effectiveDate,
						fetchedAt
					})
					.onConflictDoNothing();
				for (const rate of table.rates)
					await tx
						.insert(exchangeRate)
						.values({
							source: 'NBP',
							tableNumber: table.no,
							effectiveDate: table.effectiveDate,
							currency: rate.code,
							rateToPln: String(rate.mid)
						})
						.onConflictDoNothing();
			}
		});
	const recordFetch = (requestKey: string, fromDate: string | null, toDate: string | null) =>
		database
			.insert(exchangeRateFetch)
			.values({ source: 'NBP', requestKey, fromDate, toDate, fetchedAt: new Date() })
			.onConflictDoUpdate({
				target: [exchangeRateFetch.source, exchangeRateFetch.requestKey],
				set: { fetchedAt: new Date() }
			});
	const fetchHistorical = async (from: string, to: string) => {
		if (!nbp?.historical) return;
		const tables = await nbp.historical(from, to);
		await cacheTables(tables);
		await recordFetch(`historical:${from}:${to}`, from, to);
	};
	const refreshLatest = () => {
		if (!latestRefresh && nbp?.latest)
			latestRefresh = nbp
				.latest()
				.then(async (tables) => {
					await cacheTables(tables);
					await recordFetch('latest', null, null);
				})
				.catch((error) => {
					latestFailureUntil = Date.now() + 60_000;
					throw error;
				})
				.finally(() => {
					latestRefresh = undefined;
				});
		return latestRefresh;
	};
	const point = async (
		workspaceId: string,
		currency: string,
		onOrBefore?: string,
		allowBackfill = true
	) => {
		const cutoff = onOrBefore ?? todayInWarsaw();
		if (currency === 'PLN')
			return {
				currency,
				rateToPln: '1',
				source: 'identity',
				effectiveDate: cutoff,
				tableNumber: null
			};
		const automatic = await database
			.select()
			.from(exchangeRate)
			.where(and(eq(exchangeRate.currency, currency), lte(exchangeRate.effectiveDate, cutoff)))
			.orderBy(desc(exchangeRate.effectiveDate))
			.limit(1);
		const manual = await database
			.select()
			.from(workspaceManualRate)
			.where(
				and(
					eq(workspaceManualRate.workspaceId, workspaceId),
					eq(workspaceManualRate.currency, currency),
					isNull(workspaceManualRate.removedAt),
					lte(workspaceManualRate.effectiveDate, cutoff)
				)
			)
			.orderBy(desc(workspaceManualRate.effectiveDate))
			.limit(1);
		const a = automatic[0],
			m = manual[0];
		const selected =
			m && (!a || m.effectiveDate >= a.effectiveDate)
				? { ...m, source: 'manual', tableNumber: null }
				: a
					? { ...a, tableNumber: a.tableNumber, source: 'NBP' }
					: null;
		if (!onOrBefore && nbp?.latest && allowBackfill) {
			const [latestAttempt] = await database
				.select()
				.from(exchangeRateFetch)
				.where(and(eq(exchangeRateFetch.source, 'NBP'), eq(exchangeRateFetch.requestKey, 'latest')))
				.limit(1);
			const due =
				Date.now() >= latestFailureUntil &&
				(!latestAttempt || Date.now() - latestAttempt.fetchedAt.getTime() >= 60 * 60 * 1000);
			if (due) {
				const refresh = refreshLatest();
				if (!selected && refresh) await refresh.catch(() => undefined);
				else void refresh?.catch(() => undefined);
				if (!selected) return point(workspaceId, currency, cutoff, false);
			}
		}
		const [coverage] = onOrBefore
			? await database
					.select({ requestKey: exchangeRateFetch.requestKey })
					.from(exchangeRateFetch)
					.where(
						and(
							eq(exchangeRateFetch.source, 'NBP'),
							lte(exchangeRateFetch.fromDate, cutoff),
							gte(exchangeRateFetch.toDate, cutoff)
						)
					)
					.limit(1)
			: [];
		if (nbp?.historical && onOrBefore && allowBackfill && !coverage) {
			if (!historicalRefresh && Date.now() >= historicalFailureUntil) {
				const end = new Date(`${cutoff}T12:00:00Z`);
				const start = new Date(end);
				start.setUTCDate(start.getUTCDate() - 92);
				historicalRefresh = fetchHistorical(start.toISOString().slice(0, 10), cutoff)
					.catch(() => {
						historicalFailureUntil = Date.now() + 60_000;
					})
					.finally(() => {
						historicalRefresh = undefined;
					});
			}
			if (selected) return selected;
			if (historicalRefresh) await historicalRefresh;
			return point(workspaceId, currency, cutoff, false);
		}
		return selected;
	};
	const provenance = (value: NonNullable<Awaited<ReturnType<typeof point>>>) => ({
		currency: value.currency,
		rateToPln: value.rateToPln,
		source: value.source as 'identity' | 'NBP' | 'manual',
		effectiveDate: value.effectiveDate,
		tableNumber: value.tableNumber,
		manualOverrideId: value.source === 'manual' && 'id' in value ? value.id : null,
		reason: value.source === 'manual' && 'reason' in value ? value.reason : null,
		actorDisplay: value.source === 'manual' && 'actorDisplay' in value ? value.actorDisplay : null
	});
	return {
		cacheTables,
		refreshLatest,
		lookup: point,
		async quote(
			userId: string,
			workspaceId: string,
			input: {
				fromCurrency: string;
				toCurrency: string;
				date: string;
				amountMinor: string;
			}
		) {
			await authorized(userId, workspaceId);
			const sameCurrency = input.fromCurrency === input.toCurrency;
			const from = sameCurrency ? null : await point(workspaceId, input.fromCurrency, input.date);
			const to = sameCurrency ? null : await point(workspaceId, input.toCurrency, input.date);
			if (!sameCurrency && (!from || !to))
				return { available: false as const, suggestedAmountMinor: null, rates: [] };
			const suggestedAmountMinor = sameCurrency
				? input.amountMinor
				: roundRational(
						convertMinorRational(
							BigInt(input.amountMinor),
							input.fromCurrency,
							input.toCurrency,
							from!.rateToPln,
							to!.rateToPln
						)
					).toString();
			return {
				available: true as const,
				suggestedAmountMinor,
				rates: [from, to].filter((value) => value != null).map(provenance)
			};
		},
		async status() {
			const [latest] = await database
				.select()
				.from(exchangeRateTable)
				.orderBy(desc(exchangeRateTable.effectiveDate))
				.limit(1);
			if (!latest) return { available: false, stale: true, latest: null };
			const days = polishBusinessDaysAfter(latest.effectiveDate);
			return { available: true, stale: days >= 5, latest };
		},
		async listOverrides(userId: string, workspaceId: string) {
			await authorized(userId, workspaceId);
			return database
				.select()
				.from(workspaceManualRate)
				.where(eq(workspaceManualRate.workspaceId, workspaceId))
				.orderBy(desc(workspaceManualRate.effectiveDate));
		},
		async addOverride(userId: string, workspaceId: string, input: ManualRateInput) {
			await authorized(userId, workspaceId);
			const [actor] = await database
				.select({ name: user.name, email: user.email })
				.from(user)
				.where(eq(user.id, userId));
			const row = {
				id: crypto.randomUUID(),
				workspaceId,
				actorUserId: userId,
				actorDisplay: actor?.name || actor?.email || userId,
				...input
			};
			await database.insert(workspaceManualRate).values(row);
			return row;
		},
		async removeOverride(userId: string, workspaceId: string, id: string) {
			await authorized(userId, workspaceId);
			const deleted = await database
				.update(workspaceManualRate)
				.set({ removedAt: new Date(), removedByUserId: userId })
				.where(
					and(
						eq(workspaceManualRate.id, id),
						eq(workspaceManualRate.workspaceId, workspaceId),
						isNull(workspaceManualRate.removedAt)
					)
				)
				.returning();
			if (!deleted.length)
				throw Object.assign(new Error('Override not found'), { code: 'not_found' });
			return { deleted: true };
		},
		async reportingSummary(workspaceId: string, summary: Summary) {
			const [ws] = await database
				.select({ reportingCurrency: workspace.reportingCurrency })
				.from(workspace)
				.where(eq(workspace.id, workspaceId));
			const currency = ws?.reportingCurrency ?? 'PLN';
			let income: Rational = { numerator: 0n, denominator: 1n };
			let spending: Rational = { numerator: 0n, denominator: 1n };
			let uncategorized: Rational = { numerator: 0n, denominator: 1n };
			const rates = new Map<string, ReturnType<typeof provenance>>();
			for (const source of summary.currencies) {
				for (const group of source.groups) {
					for (const transaction of group.transactions) {
						const sameCurrency = source.currency === currency;
						const from = sameCurrency
							? null
							: await point(workspaceId, source.currency, transaction.date);
						const to = sameCurrency ? null : await point(workspaceId, currency, transaction.date);
						if (!sameCurrency && (!from || !to))
							return {
								...summary,
								reporting: {
									currency,
									incomeMinor: null,
									spendingMinor: null,
									uncategorizedMinor: null,
									missingRate: true,
									rates: [...rates.values()]
								}
							};
						for (const used of [from, to])
							if (used) {
								const value = provenance(used);
								rates.set(
									`${value.currency}:${value.source}:${value.effectiveDate}:${value.tableNumber ?? value.manualOverrideId ?? ''}`,
									value
								);
							}
						const amount = sameCurrency
							? { numerator: BigInt(transaction.amountMinor), denominator: 1n }
							: convertMinorRational(
									BigInt(transaction.amountMinor),
									source.currency,
									currency,
									from!.rateToPln,
									to!.rateToPln
								);
						if (transaction.kind === 'income') income = addRational(income, amount);
						else spending = addRational(spending, amount);
						if (!group.categoryId) uncategorized = addRational(uncategorized, amount);
					}
				}
			}
			return {
				...summary,
				reporting: {
					currency,
					incomeMinor: roundRational(income).toString(),
					spendingMinor: roundRational(spending).toString(),
					uncategorizedMinor: roundRational(uncategorized).toString(),
					missingRate: false,
					rates: [...rates.values()]
				}
			};
		},
		async currentBalances(
			userId: string,
			workspaceId: string,
			ledger: { listAccounts(context: { userId: string; workspaceId: string }): Promise<unknown> }
		) {
			await authorized(userId, workspaceId);
			const [ws] = await database
				.select({ reportingCurrency: workspace.reportingCurrency })
				.from(workspace)
				.where(eq(workspace.id, workspaceId));
			const reportingCurrency = ws.reportingCurrency ?? 'PLN';
			const result = await ledger.listAccounts({ userId, workspaceId });
			if (!Array.isArray(result)) throw new Error('Account service returned an invalid response');
			const accounts = result as Array<{
				currency: string;
				balanceMinor: string;
				[key: string]: unknown;
			}>;
			let total: Rational = { numerator: 0n, denominator: 1n };
			let missingRate = false;
			const converted = [];
			const usedRates = new Map<string, ReturnType<typeof provenance>>();
			for (const account of accounts) {
				const sameCurrency = account.currency === reportingCurrency;
				const from = sameCurrency ? null : await point(workspaceId, account.currency);
				const to = sameCurrency ? null : await point(workspaceId, reportingCurrency);
				if (!sameCurrency && (!from || !to)) {
					missingRate = true;
					converted.push({ ...account, convertedBalanceMinor: null, rates: [] });
					continue;
				}
				const accountRates = [from, to].filter((value) => value != null).map(provenance);
				for (const rate of accountRates)
					usedRates.set(
						`${rate.currency}:${rate.source}:${rate.effectiveDate}:${rate.tableNumber ?? rate.manualOverrideId ?? ''}`,
						rate
					);
				const exact = sameCurrency
					? { numerator: BigInt(account.balanceMinor), denominator: 1n }
					: convertMinorRational(
							BigInt(account.balanceMinor),
							account.currency,
							reportingCurrency,
							from!.rateToPln,
							to!.rateToPln
						);
				total = addRational(total, exact);
				converted.push({
					...account,
					convertedBalanceMinor: roundRational(exact).toString(),
					rates: accountRates
				});
			}
			return {
				reportingCurrency,
				totalMinor: missingRate ? null : roundRational(total).toString(),
				accounts: converted,
				rates: [...usedRates.values()],
				missingRate
			};
		}
	};
}
