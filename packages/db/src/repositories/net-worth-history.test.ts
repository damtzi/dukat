import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { user } from '../schema';
import { createNetWorthHistoryRepository } from './net-worth-history';

test('daily history is idempotent and keeps source values and rates', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-net-worth-history-'));
	const url = `file:${join(directory, 'db.sqlite')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{ id: 'owner', name: 'Owner', username: 'owner', email: 'owner@history.test' },
			{ id: 'member', name: 'Member', username: 'member', email: 'member@history.test' }
		]);

		let eurBalance = '10000';
		let rate = '4.2';
		let rateMissing = false;
		let failingUser = '';
		const repository = createNetWorthHistoryRepository({
			database: financial.db,
			workspaces: {
				async listAuthorized(userId: string) {
					if (userId === failingUser) throw new Error('Workspace query failed');
					return [
						{ id: 'personal', name: 'Personal', type: 'personal' as const },
						{ id: 'home', name: 'Home', type: 'household' as const }
					];
				}
			},
			ledger: {} as never,
			exchangeRates: {
				async currentBalances(_userId: string, workspaceId: string) {
					if (workspaceId === 'home') {
						return {
							totalMinor: '-2000',
							missingRate: false,
							accounts: [
								{
									id: 'card',
									name: 'Card',
									type: 'credit_card' as const,
									currency: 'PLN',
									balanceMinor: '-2000',
									convertedBalanceMinor: '-2000',
									rates: []
								}
							],
							rates: []
						};
					}
					return {
						totalMinor: rateMissing
							? null
							: ((BigInt(eurBalance) * BigInt(rate.replace('.', ''))) / 10n).toString(),
						missingRate: rateMissing,
						accounts: [
							{
								id: 'cash',
								name: 'EUR cash',
								type: 'cash' as const,
								currency: 'EUR',
								balanceMinor: eurBalance,
								convertedBalanceMinor: rateMissing
									? null
									: ((BigInt(eurBalance) * BigInt(rate.replace('.', ''))) / 10n).toString(),
								rates: rateMissing
									? []
									: [
											{
												currency: 'EUR',
												rateToPln: rate,
												source: 'manual' as const,
												effectiveDate: '2026-09-04',
												tableNumber: null,
												manualOverrideId: 'rate-1',
												reason: 'Test rate',
												actorDisplay: 'Owner'
											}
										]
							}
						],
						rates: []
					};
				}
			} as never
		});

		assert.equal(await repository.recordUser('owner', '2026-09-04'), true);
		eurBalance = '20000';
		rate = '5.0';
		assert.equal(await repository.recordUser('owner', '2026-09-04'), false);
		assert.equal(await repository.recordUser('owner', '2026-09-05'), true);
		rateMissing = true;
		assert.equal(await repository.recordUser('owner', '2026-09-06'), true);

		const history = await repository.list('owner');
		assert.deepEqual(
			history.map(({ date, personalNetWorth, householdNetWorth, combinedNetWorth }) => ({
				date,
				personalNetWorth,
				householdNetWorth,
				combinedNetWorth
			})),
			[
				{
					date: '2026-09-04',
					personalNetWorth: { amountMinor: '42000', missingRate: false },
					householdNetWorth: { amountMinor: '-2000', missingRate: false },
					combinedNetWorth: { amountMinor: '40000', missingRate: false }
				},
				{
					date: '2026-09-05',
					personalNetWorth: { amountMinor: '100000', missingRate: false },
					householdNetWorth: { amountMinor: '-2000', missingRate: false },
					combinedNetWorth: { amountMinor: '98000', missingRate: false }
				},
				{
					date: '2026-09-06',
					personalNetWorth: { amountMinor: null, missingRate: true },
					householdNetWorth: { amountMinor: '-2000', missingRate: false },
					combinedNetWorth: { amountMinor: null, missingRate: true }
				}
			]
		);
		assert.equal(history[0].workspaces[0].accounts[0].balanceMinor, '10000');
		assert.equal(history[0].workspaces[0].accounts[0].rates[0]?.rateToPln, '4.2');

		failingUser = 'member';
		const failures = await repository.recordAll('2026-09-07');
		assert.deepEqual(
			failures.map(({ userId }) => userId),
			['member']
		);
		assert.equal((await repository.list('owner')).length, 4);
		assert.equal((await repository.list('member')).length, 0);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
