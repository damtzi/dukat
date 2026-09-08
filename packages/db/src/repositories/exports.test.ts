import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import {
	categoryBudget,
	financialAccount,
	householdExpense,
	ledgerBalanceCheck,
	ledgerTransaction,
	plannedSeries,
	user,
	workspace,
	workspaceMembership
} from '../schema';
import { createExportRepository } from './exports';

async function text(chunks: AsyncIterable<string>) {
	let result = '';
	for await (const chunk of chunks) result += chunk;
	return result;
}

test('exports complete authorized data while hiding another member Personal source', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-exports-'));
	const url = `file:${join(directory, 'exports.db')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{ id: 'owner', name: 'Owner', username: 'export_owner', email: 'owner@export.test' },
			{ id: 'member', name: 'Member', username: 'export_member', email: 'member@export.test' },
			{
				id: 'outsider',
				name: 'Outsider',
				username: 'export_outsider',
				email: 'outsider@export.test'
			}
		]);
		const personal = await connection.db.select().from(workspace);
		const ownerPersonal = personal.find(
			({ personalOwnerUserId }) => personalOwnerUserId === 'owner'
		)!;
		const memberPersonal = personal.find(
			({ personalOwnerUserId }) => personalOwnerUserId === 'member'
		)!;
		const outsiderPersonal = personal.find(
			({ personalOwnerUserId }) => personalOwnerUserId === 'outsider'
		)!;
		await connection.db.insert(workspace).values({
			id: 'home',
			name: 'Home',
			type: 'household',
			reportingCurrency: 'PLN'
		});
		await connection.db.insert(workspaceMembership).values([
			{ workspaceId: 'home', userId: 'owner', role: 'owner' },
			{ workspaceId: 'home', userId: 'member', role: 'member' }
		]);
		await financial.db.insert(financialAccount).values([
			{
				id: 'owner-account',
				workspaceId: ownerPersonal.id,
				name: 'Owner private',
				type: 'current',
				currency: 'EUR',
				openingDate: '2026-01-01',
				openingBalanceMinor: 1000n,
				archivedAt: new Date('2026-08-01T00:00:00Z')
			},
			{
				id: 'member-account',
				workspaceId: memberPersonal.id,
				name: 'Member private',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-01-01',
				openingBalanceMinor: 2000n
			},
			{
				id: 'outsider-account',
				workspaceId: outsiderPersonal.id,
				name: 'Outsider secret',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-01-01',
				openingBalanceMinor: 3000n
			},
			{
				id: 'home-account',
				workspaceId: 'home',
				name: 'Shared cash',
				type: 'cash',
				currency: 'PLN',
				openingDate: '2026-01-01',
				openingBalanceMinor: 4000n
			}
		]);
		await financial.db.insert(ledgerTransaction).values([
			{
				id: 'owner-source',
				workspaceId: ownerPersonal.id,
				accountId: 'owner-account',
				kind: 'expense',
				amountMinor: 125n,
				date: '2026-08-02',
				trashedAt: new Date('2026-08-03T00:00:00Z')
			},
			{
				id: 'member-source',
				workspaceId: memberPersonal.id,
				accountId: 'member-account',
				kind: 'expense',
				amountMinor: 250n,
				date: '2026-08-02'
			},
			{
				id: 'outsider-secret',
				workspaceId: outsiderPersonal.id,
				accountId: 'outsider-account',
				kind: 'income',
				amountMinor: 999n,
				date: '2026-08-02'
			}
		]);
		await financial.db.insert(householdExpense).values([
			{
				id: 'owner-shared',
				workspaceId: 'home',
				sourceTransactionId: 'owner-source',
				payerUserId: 'owner',
				amountMinor: 125n,
				currency: 'EUR',
				date: '2026-08-02'
			},
			{
				id: 'member-shared',
				workspaceId: 'home',
				sourceTransactionId: 'member-source',
				payerUserId: 'member',
				amountMinor: 250n,
				currency: 'PLN',
				date: '2026-08-02'
			}
		]);
		await financial.db.insert(ledgerBalanceCheck).values({
			id: 'snapshot',
			workspaceId: ownerPersonal.id,
			accountId: 'owner-account',
			date: '2026-08-01',
			observedBalanceMinor: 1500n
		});
		const [category] = await financial.db.query.ledgerCategory.findMany({
			where: (table, { eq }) => eq(table.workspaceId, ownerPersonal.id),
			limit: 1
		});
		await financial.db.insert(categoryBudget).values({
			id: 'budget',
			workspaceId: ownerPersonal.id,
			categoryId: category.id,
			month: '2026-08',
			amountMinor: 5000n,
			reportingCurrency: 'PLN'
		});
		await financial.db.insert(plannedSeries).values({
			id: 'plan',
			rootPlanId: 'plan',
			workspaceId: ownerPersonal.id,
			accountId: 'owner-account',
			kind: 'income',
			amountMinor: 700n,
			date: '2026-09-01',
			effectiveFrom: '2026-09-01',
			status: 'expected'
		});

		const exports = createExportRepository(
			connection.db,
			financial.db,
			() => new Date('2026-09-08T10:00:00Z')
		);
		const ownerExport = JSON.parse(await text(exports.completeJson('owner')));
		assert.equal(ownerExport.contract, 'dukat.user-export');
		assert.equal(ownerExport.version, 1);
		assert.equal(ownerExport.owner.email, 'owner@export.test');
		assert.deepEqual(ownerExport.data.accounts.map(({ id }: { id: string }) => id).sort(), [
			'home-account',
			'owner-account'
		]);
		assert.equal(
			ownerExport.data.accounts.find(({ id }: { id: string }) => id === 'owner-account')
				.openingBalanceMinor,
			'1000'
		);
		assert.ok(
			ownerExport.data.accounts.find(({ id }: { id: string }) => id === 'owner-account').archivedAt
		);
		assert.ok(ownerExport.data.transactions[0].trashedAt);
		assert.equal(
			ownerExport.data.householdExpenses.find(({ id }: { id: string }) => id === 'owner-shared')
				.sourceTransactionId,
			null
		);
		assert.deepEqual(ownerExport.data.personalHouseholdFundingLinks, [
			{ householdExpenseId: 'owner-shared', sourceTransactionId: 'owner-source' }
		]);
		assert.equal(
			ownerExport.data.householdExpenses.find(({ id }: { id: string }) => id === 'member-shared')
				.sourceTransactionId,
			null
		);
		assert.equal(JSON.stringify(ownerExport).includes('Outsider secret'), false);

		const memberExport = JSON.parse(await text(exports.completeJson('member')));
		assert.equal(
			memberExport.data.householdExpenses.find(({ id }: { id: string }) => id === 'owner-shared')
				.sourceVisibility,
			'private'
		);
		assert.equal(JSON.stringify(memberExport).includes('Owner private'), false);
		assert.equal(JSON.stringify(memberExport).includes('owner-source'), false);
		assert.deepEqual(memberExport.data.personalHouseholdFundingLinks, [
			{ householdExpenseId: 'member-shared', sourceTransactionId: 'member-source' }
		]);

		const transactions = await text(exports.csv('owner', 'transactions'));
		assert.match(transactions, /^contract_version,workspace_scope/);
		assert.match(transactions, /1,personal,[^,]+,owner-source,owner-account,EUR/);
		assert.doesNotMatch(transactions, /outsider-secret/);
		assert.match(
			await text(exports.csv('owner', 'balances')),
			/snapshot,snapshot,owner-account,EUR,2026-08-01,1500/
		);
		assert.match(await text(exports.csv('owner', 'budgets')), /budget,[^,]+,2026-08,5000,PLN/);
		assert.match(
			await text(exports.csv('owner', 'future-holdings')),
			/plan,plan,owner-account,EUR/
		);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
