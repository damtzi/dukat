import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createDatabase, createFinancialDatabase } from '@dukat/db/connection';
import { createLedgerRepository } from '@dukat/db/repositories/ledger';
import { user } from '@dukat/db/schema/index';
import { migrate } from 'drizzle-orm/libsql/migrator';
import type { APIServices } from '../../services';
import { createAPI } from '../../app';

function createServices(): APIServices {
	return {
		auth: {
			async usernameAvailability(username) {
				return { available: true, username, message: 'Username is available.' };
			},
			async handler() {
				return new Response(null, { status: 404 });
			},
			api: {
				async getSession({ headers }) {
					return headers.get('authorization') === 'Session test'
						? {
								user: {
									id: 'user-1',
									name: 'User One',
									username: 'user_one',
									email: 'user@example.com',
									emailVerified: true,
									image: null
								}
							}
						: null;
				},
				async verifyPassword() {}
			}
		},
		async readiness() {},
		favorites: {} as APIServices['favorites'],
		ledger: {
			async listAccounts() {
				return [];
			},
			async createAccount(_context, input) {
				return input;
			},
			async updateAccount() {
				throw Object.assign(new Error('Account version is stale'), { code: 'conflict' });
			},
			async accountArchiveImpact() {
				return { accountVersion: 1, date: '2026-08-06', plans: [], impactToken: 'token' };
			},
			async accountAction() {},
			async listTransactions() {
				return [];
			},
			async searchTransactions(_context, filters) {
				return [filters];
			},
			async createTransaction(_context, _accountId, input) {
				return input;
			},
			async createRefund(_context, _expenseId, input) {
				return input;
			},
			async updateTransaction() {},
			async transactionAction() {},
			async createTransfer(_context, input) {
				return input;
			},
			async listTransfers() {
				return [];
			},
			async updateTransfer() {},
			async transferAction() {},
			async createBalanceCheck(_context, input) {
				return input;
			},
			async listBalanceChecks() {
				return [];
			},
			async listBalanceCorrections() {
				return [];
			},
			async updateBalanceCheck() {},
			async createBalanceCorrection(_context, input) {
				return input;
			},
			async reconciliationAction() {},
			async history() {
				return [];
			}
		},
		planning: {} as APIServices['planning'],
		insights: {} as APIServices['insights'],
		workspaces: {
			async listAuthorized() {
				return [];
			},
			async findAuthorized() {
				return undefined;
			}
		} as unknown as APIServices['workspaces']
	};
}

const headers = {
	authorization: 'Session test',
	'content-type': 'application/json'
};

test('ledger routes require authentication and validate financial boundaries', async () => {
	const app = createAPI(createServices());
	const path = '/api/workspaces/workspace-1/accounts';
	const validAccount = {
		name: 'Cash',
		type: 'cash',
		currency: 'PLN',
		openingDate: '2026-07-30',
		openingBalanceMinor: '100',
		idempotencyKey: 'account-create-1'
	};

	assert.equal(
		(
			await app.request(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(validAccount)
			})
		).status,
		401
	);
	const missingOpeningDate = await app.request(path, {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...validAccount, openingDate: undefined })
	});
	assert.equal(missingOpeningDate.status, 400);
	const invalidCurrency = await app.request(path, {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...validAccount, currency: 'ZZZ' })
	});
	assert.equal(invalidCurrency.status, 400);
	assert.deepEqual(await invalidCurrency.json(), {
		message: 'Currency must be PLN or an NBP Table A currency'
	});
	const creditCard = await app.request(path, {
		method: 'POST',
		headers,
		body: JSON.stringify({ ...validAccount, name: 'Card', type: 'credit_card' })
	});
	assert.equal(creditCard.status, 200);
	const futureTransaction = await app.request(`${path}/account-1/transactions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			kind: 'expense',
			amountMinor: '100',
			date: '2999-01-01',
			idempotencyKey: 'transaction-create-1'
		})
	});
	assert.equal(futureTransaction.status, 400);
	assert.deepEqual(await futureTransaction.json(), { message: 'Date cannot be in the future' });
	const invalidAmount = await app.request(`${path}/account-1/transactions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			kind: 'expense',
			amountMinor: '1.2',
			date: '2026-07-30',
			idempotencyKey: 'transaction-create-2'
		})
	});
	assert.equal(invalidAmount.status, 400);
	assert.deepEqual(await invalidAmount.json(), {
		message: 'Amount must be a canonical decimal integer string'
	});
});

test('ledger routes expose optimistic conflicts without overwriting', async () => {
	const response = await createAPI(createServices()).request(
		'/api/workspaces/workspace-1/accounts/account-1',
		{
			method: 'PUT',
			headers,
			body: JSON.stringify({
				name: 'Cash',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-07-30',
				openingBalanceMinor: '100',
				version: 1,
				idempotencyKey: 'account-update-1'
			})
		}
	);

	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), { message: 'Account version is stale' });
});

test('ledger exposes archive impact and requires its token for archive', async () => {
	const app = createAPI(createServices());
	const impact = await app.request(
		'/api/workspaces/workspace-1/accounts/account-1/archive-impact',
		{ headers }
	);
	assert.equal(impact.status, 200);
	assert.equal(((await impact.json()) as { impactToken: string }).impactToken, 'token');
	const archive = await app.request('/api/workspaces/workspace-1/accounts/account-1/archive', {
		method: 'POST',
		headers,
		body: JSON.stringify({ version: 1, idempotencyKey: 'archive-without-token' })
	});
	assert.equal(archive.status, 400);
});

test('ledger transaction search validates and forwards structured filters', async () => {
	const app = createAPI(createServices());
	const response = await app.request(
		'/api/workspaces/workspace-1/transactions?query=market&accountId=account-1&categoryId=category-1&amountMinMinor=100&amountMaxMinor=200&dateFrom=2026-08-01&dateTo=2026-08-31&includeTrashed=true&limit=25',
		{ headers }
	);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), [
		{
			query: 'market',
			accountId: 'account-1',
			categoryId: 'category-1',
			amountMinMinor: '100',
			amountMaxMinor: '200',
			dateFrom: '2026-08-01',
			dateTo: '2026-08-31',
			includeTrashed: 'true',
			limit: 25
		}
	]);
	const invalid = await app.request(
		'/api/workspaces/workspace-1/transactions?amountMinMinor=200&amountMaxMinor=100',
		{ headers }
	);
	assert.equal(invalid.status, 400);
	assert.deepEqual(await invalid.json(), {
		message: 'Minimum amount cannot exceed maximum amount'
	});
});

test('ledger creates a validated refund from an expense', async () => {
	const app = createAPI(createServices());
	const response = await app.request('/api/workspaces/workspace-1/transactions/expense-1/refunds', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			amountMinor: '2500',
			date: '2026-08-02',
			description: 'Returned item',
			idempotencyKey: 'partial-refund'
		})
	});
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		amountMinor: '2500',
		date: '2026-08-02',
		description: 'Returned item',
		idempotencyKey: 'partial-refund'
	});

	const invalid = await app.request('/api/workspaces/workspace-1/transactions/expense-1/refunds', {
		method: 'POST',
		headers,
		body: JSON.stringify({
			amountMinor: '0',
			date: '2026-08-02',
			idempotencyKey: 'invalid-refund'
		})
	});
	assert.equal(invalid.status, 400);
});

test('ledger HTTP routes use the migrated database and exact-money repository', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-ledger-api-'));
	const url = `file:${join(directory, 'ledger.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../../../../db/src/migrations', import.meta.url))
		});
		await connection.db.insert(user).values({
			id: 'integration-owner',
			name: 'Owner',
			username: 'integration_owner',
			email: 'integration@example.com'
		});
		const workspaces = await connection.client.execute(
			"select id from workspace where personal_owner_user_id = 'integration-owner'"
		);
		const workspaceId = String(workspaces.rows[0].id);
		const services = createServices();
		services.auth.api.getSession = async () => ({
			user: {
				id: 'integration-owner',
				name: 'Owner',
				username: 'integration_owner',
				email: 'owner@example.com',
				emailVerified: true,
				image: null
			}
		});
		services.ledger = createLedgerRepository(financial.db);
		const app = createAPI(services);

		const accountResponse = await app.request(`/api/workspaces/${workspaceId}/accounts`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: 'Exact cash',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-07-30',
				openingBalanceMinor: '9223372036854775807',
				idempotencyKey: 'integration-account'
			})
		});
		assert.equal(accountResponse.status, 200);
		const account = (await accountResponse.json()) as { id: string; balanceMinor: string };
		assert.equal(account.balanceMinor, '9223372036854775807');

		const transactionResponse = await app.request(
			`/api/workspaces/${workspaceId}/accounts/${account.id}/transactions`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					kind: 'expense',
					amountMinor: '9223372036854775807',
					date: '2026-07-31',
					idempotencyKey: 'integration-transaction'
				})
			}
		);
		assert.equal(transactionResponse.status, 200);
		assert.equal(
			((await transactionResponse.json()) as { balanceMinor: string }).balanceMinor,
			'0'
		);

		const boundaryAccountResponse = await app.request(`/api/workspaces/${workspaceId}/accounts`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name: 'Boundary cash',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-07-29',
				openingBalanceMinor: '-9223372036854775808',
				idempotencyKey: 'integration-boundary-account'
			})
		});
		assert.equal(boundaryAccountResponse.status, 200);
		const boundaryAccount = (await boundaryAccountResponse.json()) as { id: string };
		const checkResponse = await app.request(`/api/workspaces/${workspaceId}/balance-checks`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				accountId: boundaryAccount.id,
				date: '2026-07-30',
				observedBalanceMinor: '9223372036854775807',
				idempotencyKey: 'integration-boundary-check'
			})
		});
		assert.equal(checkResponse.status, 200);
		assert.equal(
			((await checkResponse.json()) as { differenceMinor: string }).differenceMinor,
			'18446744073709551615'
		);
		const correctionResponse = await app.request(`/api/workspaces/${workspaceId}/corrections`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				accountId: boundaryAccount.id,
				date: '2026-07-30',
				amountMinor: '18446744073709551615',
				idempotencyKey: 'integration-boundary-correction'
			})
		});
		assert.equal(correctionResponse.status, 200);
		assert.equal(
			((await correctionResponse.json()) as { amountMinor: string }).amountMinor,
			'18446744073709551615'
		);
		const outsideResponse = await app.request(`/api/workspaces/${workspaceId}/corrections`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				accountId: boundaryAccount.id,
				date: '2026-07-30',
				amountMinor: '18446744073709551616',
				idempotencyKey: 'integration-outside-correction'
			})
		});
		assert.equal(outsideResponse.status, 400);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
