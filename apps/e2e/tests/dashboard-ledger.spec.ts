import { expect, test, type Page, type Route } from '@playwright/test';

type Account = {
	id: string;
	name: string;
	type: 'current' | 'savings' | 'cash';
	currency: string;
	openingBalanceMinor: string;
	version: number;
	archivedAt: string | null;
};

type Transaction = {
	id: string;
	kind: 'expense' | 'income';
	amountMinor: string;
	date: string;
	description: string | null;
	version: number;
	trashedAt: string | null;
};

const workspaceId = 'workspace-e2e';
const accountId = 'account-e2e';
const key = expect.stringMatching(/^\d+-[0-9a-f-]{36}$/);

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockLedger(page: Page) {
	let account: Account | undefined;
	const transactions: Transaction[] = [];
	let transactionNumber = 0;

	const balance = () =>
		BigInt(account?.openingBalanceMinor ?? '0') +
		transactions
			.filter((item) => !item.trashedAt)
			.reduce(
				(sum, item) =>
					sum + (item.kind === 'income' ? BigInt(item.amountMinor) : -BigInt(item.amountMinor)),
				0n
			);
	const accountResponse = () => ({
		...account,
		balanceMinor: balance().toString(),
		negativeBalance: balance() < 0n,
		canDelete: !account?.archivedAt && transactions.length === 0,
		canArchive: !account?.archivedAt && balance() === 0n,
		canRestore: !!account?.archivedAt
	});

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname } = new URL(request.url());
		const method = request.method();
		const body = request.postDataJSON?.() as Record<string, unknown> | null;

		if (pathname === '/api/workspaces' && method === 'GET') {
			return json(route, [{ id: workspaceId, name: 'Personal', type: 'personal' }]);
		}
		if (pathname === `/api/workspaces/${workspaceId}/accounts` && method === 'GET') {
			return json(route, account ? [accountResponse()] : []);
		}
		if (pathname.endsWith('/history') && method === 'GET') {
			return json(route, [
				{
					id: 'audit-e2e',
					action: 'updated',
					actorUserId: 'user-e2e',
					createdAt: '2026-07-31T12:00:00.000Z',
					beforeJson: JSON.stringify({ description: 'Rent' }),
					afterJson: JSON.stringify({ description: 'Rent corrected' })
				}
			]);
		}
		if (pathname === `/api/workspaces/${workspaceId}/accounts` && method === 'POST') {
			account = {
				id: accountId,
				name: body.name as string,
				type: body.type as Account['type'],
				currency: body.currency as string,
				openingBalanceMinor: body.openingBalanceMinor as string,
				version: 1,
				archivedAt: null
			};
			const response = await json(route, accountResponse(), 201);
			expect(body).toEqual({
				name: 'Everyday account',
				type: 'current',
				currency: 'USD',
				openingBalanceMinor: '10000',
				idempotencyKey: key
			});
			return response;
		}
		if (pathname === `/api/workspaces/${workspaceId}/accounts/${accountId}` && method === 'PUT') {
			expect(body).toEqual({
				name: 'Household account',
				type: 'savings',
				currency: 'USD',
				openingBalanceMinor: '10000',
				version: 1,
				idempotencyKey: key
			});
			account = {
				...account!,
				name: body.name as string,
				type: body.type as Account['type'],
				version: 2
			};
			return json(route, accountResponse());
		}
		if (
			pathname === `/api/workspaces/${workspaceId}/accounts/${accountId}/transactions` &&
			method === 'GET'
		) {
			expect(new URL(request.url()).searchParams.get('includeTrashed')).toBe('true');
			return json(route, transactions);
		}
		if (
			pathname === `/api/workspaces/${workspaceId}/accounts/${accountId}/transactions` &&
			method === 'POST'
		) {
			const expected =
				transactionNumber === 0
					? {
							kind: 'expense',
							amountMinor: '12500',
							description: 'Rent',
							date: body!.date,
							idempotencyKey: key
						}
					: {
							kind: 'income',
							amountMinor: '2500',
							description: 'Refund',
							date: body!.date,
							idempotencyKey: key
						};
			expect(body).toEqual(expected);
			expect(body!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			const transaction: Transaction = {
				id: transactionNumber++ === 0 ? 'expense-e2e' : 'income-e2e',
				kind: body!.kind as Transaction['kind'],
				amountMinor: body!.amountMinor as string,
				date: body!.date as string,
				description: body!.description as string,
				version: 1,
				trashedAt: null
			};
			transactions.push(transaction);
			return json(
				route,
				{ transaction, balanceMinor: balance().toString(), negativeBalance: balance() < 0n },
				201
			);
		}
		if (
			pathname === `/api/workspaces/${workspaceId}/transactions/expense-e2e` &&
			method === 'PUT'
		) {
			const item = transactions.find(({ id }) => id === 'expense-e2e')!;
			expect(body).toEqual({
				kind: 'expense',
				amountMinor: item.version === 1 ? '12000' : '12500',
				description: 'Rent corrected',
				date: body!.date,
				version: item.version,
				idempotencyKey: key
			});
			Object.assign(item, {
				kind: body!.kind,
				amountMinor: body!.amountMinor,
				description: body!.description,
				date: body!.date,
				version: item.version + 1
			});
			return json(route, {
				transaction: item,
				balanceMinor: balance().toString(),
				negativeBalance: balance() < 0n
			});
		}
		const transactionAction = pathname.match(
			`/api/workspaces/${workspaceId}/transactions/(.+)/(trash|restore)$`
		);
		if (transactionAction && method === 'POST') {
			const [, id, action] = transactionAction;
			const item = transactions.find((candidate) => candidate.id === id)!;
			expect(body).toEqual({ version: item.version, idempotencyKey: key });
			item.version++;
			item.trashedAt = action === 'trash' ? '2026-07-31T12:00:00.000Z' : null;
			return json(route, {
				transaction: item,
				balanceMinor: balance().toString(),
				negativeBalance: balance() < 0n
			});
		}
		const accountAction = pathname.match(
			`/api/workspaces/${workspaceId}/accounts/${accountId}/(archive|restore)$`
		);
		if (accountAction && method === 'POST') {
			expect(body).toEqual({ version: account!.version, idempotencyKey: key });
			account!.version++;
			account!.archivedAt = accountAction[1] === 'archive' ? '2026-07-31T12:00:00.000Z' : null;
			return json(route, accountResponse());
		}

		return json(route, { message: `Unexpected mocked request: ${method} ${pathname}` }, 500);
	});
}

async function submitDialog(page: Page) {
	await page.getByRole('dialog').locator('form').dispatchEvent('submit');
}

test('completes the personal account and manual ledger workflow', async ({ page }) => {
	await mockLedger(page);
	await page.goto('/');

	await expect(page.getByText('No accounts', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.getByLabel('Name').fill('Everyday account');
	await page.getByLabel('Type').selectOption('current');
	await expect(page.getByLabel('Currency')).toHaveValue('USD');
	await page.getByLabel('Opening balance').fill('100.00');
	await submitDialog(page);
	await expect(page.getByText('Everyday account', { exact: true }).last()).toBeVisible();
	await expect(page.getByText('$100.00', { exact: true }).last()).toBeVisible();
	await page.getByRole('button', { name: 'Account history' }).click();
	await expect(page.getByRole('dialog')).toContainText('user-e2e');
	await expect(page.getByRole('dialog')).toContainText('description: "Rent" → "Rent corrected"');
	await page.getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'Add transaction' }).click();
	await page.getByLabel('Amount').fill('1.001');
	await submitDialog(page);
	await expect(page.getByText('Enter an amount with at most 2 decimal places.')).toBeVisible();
	await page.getByLabel('Amount').fill('125.00');
	await page.getByLabel('Description').fill('Rent');
	await submitDialog(page);
	await expect(page.getByText('Negative balance')).toBeVisible();
	await expect(page.getByText('-$25.00', { exact: true }).last()).toBeVisible();

	await page.getByRole('button', { name: 'Add transaction' }).click();
	await page.getByLabel('Kind').selectOption('income');
	await page.getByLabel('Amount').fill('25.00');
	await page.getByLabel('Description').fill('Refund');
	await submitDialog(page);
	await expect(page.getByText('$0.00', { exact: true }).last()).toBeVisible();

	const rent = page
		.getByText('Rent', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await rent.getByRole('button', { name: 'Edit' }).click();
	await page.getByLabel('Amount').fill('120.00');
	await page.getByLabel('Description').fill('Rent corrected');
	await submitDialog(page);
	await expect(page.getByText('$5.00', { exact: true }).last()).toBeVisible();

	const refund = page
		.getByText('Refund', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await refund.getByRole('button', { name: 'Trash' }).click();
	await expect(page.getByText('Negative balance')).toBeVisible();
	await refund.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByText('$5.00', { exact: true }).last()).toBeVisible();

	await page.getByRole('button', { name: 'Edit account' }).click();
	await page.getByLabel('Name').fill('Household account');
	await page.getByLabel('Type').selectOption('savings');
	await submitDialog(page);
	await expect(page.getByText('Household account', { exact: true }).last()).toBeVisible();

	// Return the ledger to zero before exercising the account lifecycle rule.
	const correctedRent = page
		.getByText('Rent corrected', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await correctedRent.getByRole('button', { name: 'Edit' }).click();
	await page.getByLabel('Amount').fill('125.00');
	await submitDialog(page);
	await page.getByRole('button', { name: 'Archive account' }).click();
	await expect(page.getByText('Archived', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add transaction' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Trash' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeHidden();
	await page.getByRole('button', { name: 'Edit account' }).click();
	await expect(page.getByLabel('Currency')).toBeDisabled();
	await expect(page.getByLabel('Opening balance')).toBeDisabled();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('button', { name: 'Restore account' }).click();
	await expect(page.getByRole('button', { name: 'Add transaction' })).toBeVisible();
});
