import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, createFinancialDatabase } from '../connection';
import { financialAccount, mortgage, user, workspace, workspaceMembership } from '../schema';
import { createMortgageRepository } from './mortgage';
import { listAuthorizedWorkspaces } from './workspaces';

test('a mortgage persists only in its payment account workspace and is private to its members', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'dukat-mortgage-'));
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
		await connection.db
			.insert(workspace)
			.values({ id: 'household', name: 'Household', type: 'household' });
		await connection.db
			.insert(workspaceMembership)
			.values({ workspaceId: 'household', userId: 'member', role: 'member' });
		await financial.db.insert(financialAccount).values([
			{
				id: 'private-account',
				workspaceId: personal.id,
				name: 'Private',
				type: 'current',
				currency: 'PLN',
				openingDate: '2025-01-01',
				openingBalanceMinor: 0n
			},
			{
				id: 'shared-account',
				workspaceId: 'household',
				name: 'Shared',
				type: 'current',
				currency: 'PLN',
				openingDate: '2025-01-01',
				openingBalanceMinor: 0n
			}
		]);
		const repository = createMortgageRepository(financial.db);
		const owner = { userId: 'owner', workspaceId: personal.id };
		const shared = { userId: 'member', workspaceId: 'household' };
		const input = {
			idempotencyKey: 'mortgage-test',
			originalPrincipalMinor: '10000000',
			currentBalanceMinor: '7500000',
			startDate: '2026-01-15',
			termMonths: 120,
			annualRateBasisPoints: 525,
			interestType: 'variable',
			paymentAccountId: 'private-account'
		};
		await assert.rejects(repository.create(shared, input), { code: 'not_found' });
		await assert.rejects(
			repository.create({ userId: 'outsider', workspaceId: personal.id }, input),
			{ code: 'not_found' }
		);
		const created = await repository.create(owner, input);
		assert.equal(created.currency, 'PLN');
		assert.equal((await repository.create(owner, input)).id, created.id);
		assert.equal((await repository.get(owner))?.currentBalanceMinor, '7500000');
		const [stored] = await financial.db
			.select({ scheduleJson: mortgage.scheduleJson })
			.from(mortgage)
			.where(eq(mortgage.id, created.id));
		assert.deepEqual(JSON.parse(stored!.scheduleJson), created.schedule);
		assert.deepEqual(
			(await createMortgageRepository(financial.db).get(owner))?.schedule,
			created.schedule
		);
		assert.equal((await repository.get(owner))?.schedule.at(-1)?.closingBalanceMinor, '0');
		await assert.rejects(repository.get({ userId: 'member', workspaceId: personal.id }), {
			code: 'not_found'
		});
		assert.equal(await repository.get(shared), null);
		const sharedMortgage = await repository.create(shared, {
			...input,
			paymentAccountId: 'shared-account'
		});
		assert.equal((await repository.get(shared))?.id, sharedMortgage.id);
		await assert.rejects(repository.get({ userId: 'outsider', workspaceId: 'household' }), {
			code: 'not_found'
		});
		assert.equal(
			(await listAuthorizedWorkspaces(connection.db, 'owner')).find(({ id }) => id === personal.id)
				?.hasMortgage,
			true
		);
		assert.equal(
			(await listAuthorizedWorkspaces(connection.db, 'member')).find(({ id }) => id === 'household')
				?.hasMortgage,
			true
		);
	} finally {
		financial.client.close();
		connection.client.close();
		await rm(directory, { recursive: true, force: true });
	}
});
