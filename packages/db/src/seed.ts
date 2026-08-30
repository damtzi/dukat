import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { hashPassword } from 'better-auth/crypto';
import { and, eq, or } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { todayInDefaultTimeZone } from '@dukat/core/ledger';

import { createDatabase, createFinancialDatabase } from './connection';
import { createLedgerRepository } from './repositories/ledger';
import { createPlanningRepository } from './repositories/planning';
import { account as authAccount, ledgerCategory, session, user, workspace } from './schema';

export const DEMO_CREDENTIALS = {
	username: 'demo',
	email: 'demo@dukat.local',
	password: 'dukat-demo'
} as const;

const USER_ID = 'seed-demo-user';
const CREDENTIAL_ID = 'seed-demo-credential';
const WORKSPACE_ID = 'seed-demo-workspace';
const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

interface SeedOptions {
	url: string;
	authToken?: string;
	now?: Date;
}

export interface SeedResult {
	userId: string;
	workspaceId: string;
	accountCount: number;
	transactionCount: number;
	planCount: number;
}

function addDays(date: string, days: number) {
	const value = new Date(`${date}T12:00:00Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function dateInMonth(today: string, monthOffset: number, preferredDay: number) {
	const [year, month, currentDay] = today.split('-').map(Number) as [number, number, number];
	const targetIndex = year * 12 + month - 1 + monthOffset;
	const targetYear = Math.floor(targetIndex / 12);
	const targetMonth = (targetIndex % 12) + 1;
	const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
	const day = monthOffset === 0 ? Math.min(preferredDay, currentDay) : preferredDay;
	return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export async function seedDatabase(options: SeedOptions): Promise<SeedResult> {
	if (!options.url.startsWith('file:')) {
		throw new Error('db:seed only accepts a local file: database URL');
	}

	const config = { url: options.url, authToken: options.authToken };
	const connection = createDatabase(config);
	const financialConnection = createFinancialDatabase(config);

	try {
		await migrate(connection.db, { migrationsFolder: MIGRATIONS_FOLDER });

		const matchingUsers = await connection.db
			.select({ id: user.id, email: user.email, username: user.username })
			.from(user)
			.where(
				or(
					eq(user.id, USER_ID),
					eq(user.email, DEMO_CREDENTIALS.email),
					eq(user.username, DEMO_CREDENTIALS.username)
				)
			);
		if (
			matchingUsers.some(
				(candidate) =>
					candidate.id !== USER_ID ||
					candidate.email !== DEMO_CREDENTIALS.email ||
					candidate.username !== DEMO_CREDENTIALS.username
			)
		) {
			throw new Error(
				`Cannot seed because ${DEMO_CREDENTIALS.email}, ${DEMO_CREDENTIALS.username}, or its seed ID is already in use`
			);
		}

		const password = await hashPassword(DEMO_CREDENTIALS.password);
		await connection.db.transaction(async (tx) => {
			if (!matchingUsers.length) {
				await tx.insert(user).values({
					id: USER_ID,
					name: 'Demo User',
					username: DEMO_CREDENTIALS.username,
					email: DEMO_CREDENTIALS.email,
					emailVerified: true,
					image: null
				});
			}
			await tx
				.update(user)
				.set({
					name: 'Demo User',
					username: DEMO_CREDENTIALS.username,
					emailVerified: true,
					image: null,
					updatedAt: new Date()
				})
				.where(eq(user.id, USER_ID));
			await tx.delete(session).where(eq(session.userId, USER_ID));
			await tx.delete(authAccount).where(eq(authAccount.userId, USER_ID));
			await tx.insert(authAccount).values({
				id: CREDENTIAL_ID,
				accountId: USER_ID,
				providerId: 'credential',
				userId: USER_ID,
				password
			});
			await tx
				.delete(workspace)
				.where(and(eq(workspace.type, 'personal'), eq(workspace.personalOwnerUserId, USER_ID)));
			await tx.insert(workspace).values({
				id: WORKSPACE_ID,
				name: 'Personal',
				type: 'personal',
				personalOwnerUserId: USER_ID,
				reportingCurrency: 'PLN'
			});
		});

		const categories = await financialConnection.db
			.select({ id: ledgerCategory.id, normalizedName: ledgerCategory.normalizedName })
			.from(ledgerCategory)
			.where(eq(ledgerCategory.workspaceId, WORKSPACE_ID));
		const categoryId = (name: string) => {
			const category = categories.find(
				(candidate) => candidate.normalizedName === name.toLowerCase()
			);
			if (!category) throw new Error(`Starter category is missing: ${name}`);
			return category.id;
		};

		const context = { userId: USER_ID, workspaceId: WORKSPACE_ID };
		const ledger = createLedgerRepository(financialConnection.db);
		const planning = createPlanningRepository(
			financialConnection.db,
			() => options.now ?? new Date()
		);
		const everyday = await ledger.createAccount(context, {
			idempotencyKey: 'seed-account-everyday',
			name: 'Everyday account',
			type: 'current',
			currency: 'PLN',
			openingBalanceMinor: '420000'
		});
		const savings = await ledger.createAccount(context, {
			idempotencyKey: 'seed-account-savings',
			name: 'Savings',
			type: 'savings',
			currency: 'PLN',
			openingBalanceMinor: '1250000'
		});
		const cash = await ledger.createAccount(context, {
			idempotencyKey: 'seed-account-cash',
			name: 'Cash',
			type: 'cash',
			currency: 'PLN',
			openingBalanceMinor: '28000'
		});

		const today = todayInDefaultTimeZone(options.now);
		const transactions: Array<{
			accountId: string;
			kind: 'income' | 'expense';
			amountMinor: string;
			date: string;
			description: string;
			category: string;
		}> = [];
		for (let monthOffset = -5; monthOffset < 0; monthOffset += 1) {
			transactions.push(
				{
					accountId: everyday.id,
					kind: 'income',
					amountMinor: '610000',
					date: dateInMonth(today, monthOffset, 1),
					description: 'Monthly salary',
					category: 'Salary'
				},
				{
					accountId: everyday.id,
					kind: 'expense',
					amountMinor: '175000',
					date: dateInMonth(today, monthOffset, 3),
					description: 'Apartment rent',
					category: 'Housing'
				},
				{
					accountId: everyday.id,
					kind: 'expense',
					amountMinor: String(52000 + (monthOffset + 5) * 1700),
					date: dateInMonth(today, monthOffset, 10),
					description: 'Groceries',
					category: 'Groceries'
				},
				{
					accountId: everyday.id,
					kind: 'expense',
					amountMinor: '31500',
					date: dateInMonth(today, monthOffset, 16),
					description: 'Utilities and subscriptions',
					category: 'Bills'
				},
				{
					accountId: everyday.id,
					kind: 'expense',
					amountMinor: '19500',
					date: dateInMonth(today, monthOffset, 21),
					description: 'Dinner out',
					category: 'Eating out'
				}
			);
		}
		transactions.push(
			{
				accountId: everyday.id,
				kind: 'income',
				amountMinor: '610000',
				date: dateInMonth(today, 0, 1),
				description: 'Monthly salary',
				category: 'Salary'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '175000',
				date: dateInMonth(today, 0, 3),
				description: 'Apartment rent',
				category: 'Housing'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '54800',
				date: dateInMonth(today, 0, 7),
				description: 'Weekly groceries',
				category: 'Groceries'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '33900',
				date: dateInMonth(today, 0, 11),
				description: 'Utilities and subscriptions',
				category: 'Bills'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '21500',
				date: dateInMonth(today, 0, 14),
				description: 'Dinner with friends',
				category: 'Eating out'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '14000',
				date: dateInMonth(today, 0, 17),
				description: 'Public transport',
				category: 'Transport'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '18900',
				date: dateInMonth(today, 0, 20),
				description: 'Home supplies',
				category: 'Shopping'
			},
			{
				accountId: everyday.id,
				kind: 'expense',
				amountMinor: '11500',
				date: dateInMonth(today, 0, 23),
				description: 'Cinema tickets',
				category: 'Entertainment'
			},
			{
				accountId: cash.id,
				kind: 'expense',
				amountMinor: '7800',
				date: dateInMonth(today, 0, 25),
				description: 'Coffee and snacks',
				category: 'Eating out'
			}
		);

		for (const [index, transaction] of transactions.entries()) {
			await ledger.createTransaction(context, transaction.accountId, {
				idempotencyKey: `seed-transaction-${index}`,
				kind: transaction.kind,
				amountMinor: transaction.amountMinor,
				date: transaction.date,
				description: transaction.description,
				categoryId: categoryId(transaction.category)
			});
		}
		await ledger.createTransfer(context, {
			idempotencyKey: 'seed-transfer-savings',
			fromAccountId: everyday.id,
			toAccountId: savings.id,
			amountMinor: '70000',
			date: dateInMonth(today, 0, 24),
			description: 'Monthly savings'
		});

		const plans = [
			{
				idempotencyKey: 'seed-plan-rent',
				accountId: everyday.id,
				kind: 'expense' as const,
				amountMinor: '175000',
				date: addDays(today, 3),
				status: 'expected' as const,
				description: 'Apartment rent',
				categoryId: categoryId('Housing'),
				recurrence: { frequency: 'monthly' as const, interval: 1 }
			},
			{
				idempotencyKey: 'seed-plan-salary',
				accountId: everyday.id,
				kind: 'income' as const,
				amountMinor: '610000',
				date: addDays(today, 5),
				status: 'expected' as const,
				description: 'Monthly salary',
				categoryId: categoryId('Salary'),
				recurrence: { frequency: 'monthly' as const, interval: 1 }
			},
			{
				idempotencyKey: 'seed-plan-bills',
				accountId: everyday.id,
				kind: 'expense' as const,
				amountMinor: '33900',
				date: addDays(today, 8),
				status: 'expected' as const,
				description: 'Utilities and subscriptions',
				categoryId: categoryId('Bills'),
				recurrence: { frequency: 'monthly' as const, interval: 1 }
			},
			{
				idempotencyKey: 'seed-plan-trip',
				accountId: savings.id,
				kind: 'expense' as const,
				amountMinor: '90000',
				date: addDays(today, 18),
				status: 'tentative' as const,
				description: 'Weekend trip',
				categoryId: categoryId('Travel')
			}
		];
		for (const plan of plans) await planning.create(context, plan);

		return {
			userId: USER_ID,
			workspaceId: WORKSPACE_ID,
			accountCount: 3,
			transactionCount: transactions.length + 2,
			planCount: plans.length
		};
	} finally {
		financialConnection.client.close();
		connection.client.close();
	}
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	try {
		const { dbEnv } = await import('@dukat/env/db');
		const result = await seedDatabase({
			url: dbEnv.TURSO_DATABASE_URL,
			authToken: dbEnv.TURSO_AUTH_TOKEN
		});
		process.stdout.write(
			[
				'Seed complete.',
				`Email: ${DEMO_CREDENTIALS.email}`,
				`Password: ${DEMO_CREDENTIALS.password}`,
				`Workspace: ${result.workspaceId}`
			].join('\n') + '\n'
		);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
