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

		if (pathname === '/api/auth/get-session' && method === 'GET') {
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		}
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
			method === 'GET' &&
			['transfers', 'balance-checks', 'corrections'].some(
				(entity) => pathname === `/api/workspaces/${workspaceId}/accounts/${accountId}/${entity}`
			)
		) {
			expect(new URL(request.url()).searchParams.get('includeTrashed')).toBe('true');
			return json(route, []);
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

test('signs up and signs in through the auth routes', async ({ page }) => {
	let authenticated = false;

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname } = new URL(request.url());
		const body = request.postDataJSON?.();

		if (pathname === '/api/auth/get-session') {
			return json(
				route,
				authenticated ? { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } } : null
			);
		}
		if (pathname === '/api/workspaces') {
			return authenticated
				? json(route, [{ id: workspaceId, name: 'Personal', type: 'personal' }])
				: json(route, { message: 'Unauthorized' }, 401);
		}
		if (pathname === '/api/auth/sign-up/email') {
			expect(body).toEqual({
				name: 'Ada Lovelace',
				email: 'ada@example.com',
				password: 'correct-horse-battery-staple',
				callbackURL: '/'
			});
			return json(route, { user: { id: 'user-e2e' }, token: null });
		}
		if (pathname === '/api/auth/sign-in/email') {
			expect(body).toEqual({
				email: 'ada@example.com',
				password: 'correct-horse-battery-staple'
			});
			authenticated = true;
			return json(route, { user: { id: 'user-e2e' }, token: 'session-e2e' });
		}
		if (pathname === `/api/workspaces/${workspaceId}/accounts`) return json(route, []);

		return json(
			route,
			{ message: `Unexpected mocked request: ${request.method()} ${pathname}` },
			500
		);
	});

	await page.goto('/');
	await expect(page).toHaveURL('/sign-in');
	await expect(page.getByText('Sign in to Dukat', { exact: true })).toBeVisible();
	await page.getByRole('link', { name: 'Create an account' }).click();
	await expect(page).toHaveURL('/sign-up');
	await page.getByLabel('Name').fill('Ada Lovelace');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery-staple');
	await page.getByRole('button', { name: 'Create account', exact: true }).click();
	await expect(
		page.getByText('Check your email to verify your account, then sign in.')
	).toBeVisible();
	await page.getByRole('link', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery-staple');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL('/dashboard');
	await expect(page.getByText('No accounts', { exact: true })).toBeVisible();
});

test('protects dashboard and routes authenticated users from root', async ({ page }) => {
	let authenticated = false;
	await page.route('**/api/auth/get-session', (route) =>
		json(route, authenticated ? { session: { id: 'session-e2e' } } : null)
	);
	await page.route('**/api/workspaces', (route) => json(route, []));
	await page.goto('/dashboard');
	await expect(page).toHaveURL('/sign-in');
	authenticated = true;
	await page.goto('/');
	await expect(page).toHaveURL('/dashboard');
});

test('completes the personal account and manual ledger workflow', async ({ page }) => {
	await mockLedger(page);
	await page.goto('/dashboard');

	await expect(page.getByText('No accounts', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.getByLabel('Name').fill('Everyday account');
	await page.getByLabel('Type').selectOption('current');
	await expect(page.getByLabel('Currency')).toContainText('USD');
	await page.getByLabel('Currency').click();
	const currencyOptions = page.getByRole('listbox').getByRole('option');
	await expect(currencyOptions).toHaveCount(14);
	await currencyOptions.filter({ hasText: 'USD — US dollar' }).click();
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

test('transfers with a separate fee and explicitly reconciles a balance', async ({ page }) => {
	const accounts = [
		{
			id: 'checking',
			name: 'Checking',
			type: 'current',
			currency: 'USD',
			openingBalanceMinor: '10000',
			version: 1,
			archivedAt: null
		},
		{
			id: 'savings',
			name: 'Savings',
			type: 'savings',
			currency: 'USD',
			openingBalanceMinor: '10000',
			version: 1,
			archivedAt: null
		}
	];
	const transfers: Array<Record<string, unknown>> = [];
	const transactions: Array<Record<string, unknown>> = [];
	const checks: Array<Record<string, unknown>> = [];
	const corrections: Array<Record<string, unknown>> = [];
	let firstFeeBody: Record<string, unknown> | undefined;
	let firstCorrectionBody: Record<string, unknown> | undefined;
	let feeAttempts = 0;
	let correctionAttempts = 0;
	const accountResponse = (account: (typeof accounts)[number]) => ({
		...account,
		balanceMinor:
			account.id === 'checking'
				? (
						10000n -
						(transfers[0]?.trashedAt ? 0n : 2000n) -
						100n +
						BigInt((corrections[0]?.amountMinor as string) ?? '0')
					).toString()
				: (10000n + (transfers[0]?.trashedAt ? 0n : 2000n)).toString(),
		negativeBalance: false,
		canDelete: false,
		canArchive: false,
		canRestore: false
	});
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		const method = request.method();
		const body = request.postDataJSON?.() as Record<string, unknown>;
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/workspaces')
			return json(route, [{ id: workspaceId, name: 'Personal', type: 'personal' }]);
		if (path === `/api/workspaces/${workspaceId}/accounts`)
			return json(route, accounts.map(accountResponse));
		if (method === 'GET' && path.endsWith('/transactions')) return json(route, transactions);
		if (method === 'GET' && path.endsWith('/transfers')) return json(route, transfers);
		if (method === 'GET' && path.endsWith('/balance-checks')) return json(route, checks);
		if (method === 'GET' && path.endsWith('/corrections')) return json(route, corrections);
		if (method === 'POST' && path.endsWith('/transfers')) {
			expect(body).toMatchObject({
				fromAccountId: 'checking',
				toAccountId: 'savings',
				amountMinor: '2000',
				description: 'Move to savings',
				idempotencyKey: key
			});
			transfers.push({ id: 'transfer-e2e', ...body, version: 1, trashedAt: null });
			return json(route, transfers[0]);
		}
		if (method === 'POST' && path.endsWith('/accounts/checking/transactions')) {
			expect(body).toMatchObject({
				kind: 'expense',
				amountMinor: '100',
				description: 'Bank transfer fee',
				idempotencyKey: key
			});
			feeAttempts += 1;
			if (!firstFeeBody) {
				firstFeeBody = body;
				transactions.push({ id: 'fee-e2e', ...body, version: 1, trashedAt: null });
				return route.abort('connectionfailed');
			}
			expect(body).toEqual(firstFeeBody);
			return json(route, {
				transaction: transactions[0],
				balanceMinor: '7900',
				negativeBalance: false
			});
		}
		if (method === 'POST' && /\/transfers\/transfer-e2e\/(trash|restore)$/.test(path)) {
			transfers[0].version = Number(transfers[0].version) + 1;
			transfers[0].trashedAt = path.endsWith('/trash') ? '2026-08-01T00:00:00Z' : null;
			return json(route, transfers[0]);
		}
		if (method === 'POST' && path.endsWith('/balance-checks')) {
			checks.push({
				id: 'check-e2e',
				...body,
				calculatedBalanceMinor: '7900',
				differenceMinor: '100',
				version: 1,
				trashedAt: null
			});
			return json(route, checks[0]);
		}
		if (method === 'POST' && path.endsWith('/corrections')) {
			expect(body).toMatchObject({
				accountId: 'checking',
				amountMinor: '100',
				description: expect.stringContaining('Balance correction'),
				idempotencyKey: key
			});
			correctionAttempts += 1;
			if (!firstCorrectionBody) {
				firstCorrectionBody = body;
				corrections.push({ id: 'correction-e2e', ...body, version: 1, trashedAt: null });
				return route.abort('connectionfailed');
			}
			expect(body).toEqual(firstCorrectionBody);
			return json(route, corrections[0]);
		}
		if (method === 'GET' && path.endsWith('/history'))
			return json(route, [
				{
					id: 'audit-transfer',
					action: 'created',
					actorUserId: 'user-e2e',
					createdAt: '2026-08-01T00:00:00Z',
					beforeJson: null,
					afterJson: JSON.stringify({ amountMinor: '2000' })
				}
			]);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto('/dashboard');
	await page.getByRole('button', { name: 'New transfer' }).click();
	await expect(page.getByLabel('Source account')).toHaveValue('checking');
	await page.getByLabel('Destination account').selectOption('savings');
	await page.getByLabel('Transfer amount').fill('20.00');
	await page.getByLabel('Note').fill('Move to savings');
	await page.getByLabel('Fee amount').fill('1.00');
	await page.getByLabel('Fee description').fill('Bank transfer fee');
	await submitDialog(page);
	await expect(page.getByRole('button', { name: 'Retry fee expense' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'New transfer' })).toBeHidden();
	await page.getByRole('button', { name: 'Retry fee expense' }).click();
	await expect(page.getByRole('button', { name: 'Retry fee expense' })).toBeHidden();
	expect(feeAttempts).toBe(2);
	expect(transactions).toHaveLength(1);
	const transfer = page
		.getByText('Outgoing transfer')
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(transfer).toContainText('Savings');
	await expect(transfer).not.toContainText('Income');
	await expect(transfer).not.toContainText('Expense');
	await expect(page.getByText('Outgoing transfer')).toHaveCount(1);
	await expect(
		page.getByText('Bank transfer fee', { exact: true }).filter({ visible: true })
	).toBeVisible();
	await transfer.getByRole('button', { name: 'Trash' }).click();
	await transfer.getByRole('button', { name: 'Restore' }).click();
	await transfer.getByRole('button', { name: 'History' }).click();
	await expect(page.getByRole('dialog')).toContainText('user-e2e');
	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('button', { name: 'Add balance check' }).click();
	await page.getByLabel('Observed balance').fill('80.00');
	await submitDialog(page);
	await expect(page.getByText('+$1.00', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Create correction' }).click();
	await expect(page.getByRole('button', { name: 'Retry correction' })).toBeVisible();
	await page.getByRole('button', { name: 'Retry correction' }).click();
	await expect(page.getByRole('button', { name: 'Retry correction' })).toBeHidden();
	expect(correctionAttempts).toBe(2);
	expect(corrections).toHaveLength(1);
	await expect(page.getByText('$80.00', { exact: true }).last()).toBeVisible();
	await expect(page.getByText('Balance correction for check', { exact: false })).toBeVisible();
});
