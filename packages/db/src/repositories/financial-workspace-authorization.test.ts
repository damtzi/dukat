import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { user, workspace, workspaceMembership } from '../schema';
import { createBudgetRepository } from './budgets';
import { createExchangeRateRepository } from './exchange-rates';
import { createInsightsRepository } from './insights';
import { createLedgerRepository } from './ledger';
import { createPlanningRepository } from './planning';

test('financial repositories share Personal and Household workspace authorization', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-financial-authorization-'));
	const url = `file:${join(directory, 'db.sqlite')}`;
	const connection = createDatabase({ url });
	const financial = createFinancialDatabase({ url });
	try {
		await migrate(connection.db, {
			migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url))
		});
		await connection.db.insert(user).values([
			{ id: 'owner', name: 'Owner', username: 'owner', email: 'owner@example.com' },
			{ id: 'member', name: 'Member', username: 'member', email: 'member@example.com' },
			{ id: 'outsider', name: 'Outsider', username: 'outsider', email: 'outsider@example.com' }
		]);
		const [personal] = await connection.db
			.select({ id: workspace.id })
			.from(workspace)
			.where(eq(workspace.personalOwnerUserId, 'owner'));
		assert.ok(personal);
		await connection.db.insert(workspace).values([
			{ id: 'household', name: 'Household', type: 'household' },
			{
				id: 'deleted-household',
				name: 'Deleted household',
				type: 'household',
				deletedAt: new Date('2026-08-01T00:00:00Z')
			}
		]);
		await connection.db.insert(workspaceMembership).values([
			{ workspaceId: personal.id, userId: 'member', role: 'member' },
			{ workspaceId: 'household', userId: 'owner', role: 'owner' },
			{ workspaceId: 'household', userId: 'member', role: 'member' },
			{ workspaceId: 'deleted-household', userId: 'owner', role: 'owner' },
			{ workspaceId: 'deleted-household', userId: 'member', role: 'member' }
		]);

		const rates = createExchangeRateRepository(financial.db);
		const repositories = {
			budgets: createBudgetRepository(financial.db, rates),
			exchangeRates: rates,
			insights: createInsightsRepository(financial.db),
			ledger: createLedgerRepository(financial.db),
			planning: createPlanningRepository(financial.db)
		};
		const operations = (context: { userId: string; workspaceId: string }) =>
			[
				['budgets', () => repositories.budgets.report(context, '2026-08')],
				[
					'exchange rates',
					() => repositories.exchangeRates.listOverrides(context.userId, context.workspaceId)
				],
				['insights', () => repositories.insights.listCategories(context)],
				['ledger', () => repositories.ledger.listAccounts(context)],
				['planning', () => repositories.planning.list(context)]
			] as const;
		const allows = async (context: { userId: string; workspaceId: string }) => {
			for (const [name, operation] of operations(context))
				await assert.doesNotReject(operation, `${name} should allow access`);
		};
		const denies = async (context: { userId: string; workspaceId: string }) => {
			for (const [name, operation] of operations(context))
				await assert.rejects(
					operation,
					(error: unknown) =>
						typeof error === 'object' &&
						error !== null &&
						'code' in error &&
						error.code === 'not_found',
					`${name} should deny access`
				);
		};

		await allows({ userId: 'owner', workspaceId: personal.id });
		await denies({ userId: 'member', workspaceId: personal.id });
		await allows({ userId: 'owner', workspaceId: 'household' });
		await allows({ userId: 'member', workspaceId: 'household' });
		await denies({ userId: 'outsider', workspaceId: 'household' });
		await denies({ userId: 'owner', workspaceId: 'deleted-household' });
		await denies({ userId: 'member', workspaceId: 'deleted-household' });
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
