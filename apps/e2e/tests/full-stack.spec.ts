import { expect, test, type Browser, type Page } from '@playwright/test';

function requiredEnvironment(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}. Run this test through the full-stack command.`);
	return value;
}

async function apiJson<T>(page: Page, path: string): Promise<T> {
	return page.evaluate(async (requestPath) => {
		const response = await fetch(`/api${requestPath}`);
		if (!response.ok) throw new Error(`API request failed (${response.status}).`);
		return response.json();
	}, path);
}

async function apiMutation<T>(
	page: Page,
	path: string,
	method: 'POST' | 'PUT' | 'DELETE',
	body: unknown
) {
	return page.evaluate(
		async ({ requestPath, requestMethod, requestBody }) => {
			const response = await fetch(`/api${requestPath}`, {
				method: requestMethod,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(requestBody)
			});
			if (!response.ok) throw new Error(`API request failed (${response.status}).`);
			return response.json();
		},
		{ requestPath: path, requestMethod: method, requestBody: body }
	) as Promise<T>;
}

async function chooseSelect(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

async function signIn(page: Page, email: string, password: string) {
	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL('/home');
}

test('persists a dated account, backdated snapshot and confirmed correction', async ({ page }) => {
	const email = requiredEnvironment('FULL_STACK_TEST_EMAIL');
	const password = requiredEnvironment('FULL_STACK_TEST_PASSWORD');
	const workspaceId = requiredEnvironment('FULL_STACK_TEST_WORKSPACE_ID');
	const accountName = 'Full-stack account';

	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL('/home');
	const personalWorkspace = page.getByLabel('Personal', { exact: true });
	await expect(personalWorkspace.getByRole('link', { name: 'Open workspace' })).toBeVisible();

	await personalWorkspace.getByRole('link', { name: 'Open workspace' }).click();
	await expect(page).toHaveURL(`/workspaces/${workspaceId}`);
	await page.goto(`/workspaces/${workspaceId}/accounts`);
	await page.getByRole('button', { name: 'Add account' }).click();
	const accountDialog = page.getByRole('dialog');
	await accountDialog.getByLabel('Name', { exact: true }).fill(accountName);
	await accountDialog.getByLabel('Opening date').fill('2026-01-01');
	await accountDialog.getByLabel('Opening balance', { exact: true }).fill('100.00');
	await accountDialog.getByRole('button', { name: 'Save account' }).click();

	const accountCard = page.locator('[data-slot="card"]').filter({ hasText: accountName });
	await expect(accountCard).toContainText(/100,00\sUSD/);
	await accountCard.getByRole('button', { name: 'View details' }).click();
	await page.getByRole('button', { name: 'Add transaction' }).click();
	const transactionDialog = page.getByRole('dialog');
	await transactionDialog.getByLabel('Amount', { exact: true }).fill('25.00');
	await chooseSelect(page, 'Category', 'Groceries');
	await transactionDialog.getByLabel('Merchant').fill('Corner Market');
	await transactionDialog.getByLabel('Description').fill('Full-stack expense');
	await transactionDialog.getByRole('button', { name: 'Save transaction' }).click();

	const accountSummary = page
		.locator('[data-slot="card"]')
		.filter({ hasText: accountName })
		.first();
	await expect(accountSummary).toContainText(/75,00\sUSD/);
	const expenseRow = page
		.getByText('Full-stack expense', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await expenseRow.getByRole('button', { name: 'Refund' }).click();
	const refundDialog = page.getByRole('dialog');
	await refundDialog.getByLabel('Amount', { exact: true }).fill('10.00');
	await refundDialog.getByLabel('Description').fill('Full-stack partial refund');
	await refundDialog.getByRole('button', { name: 'Save refund' }).click();
	await expect(accountSummary).toContainText(/85,00\sUSD/);
	const createdAccount = (
		await apiJson<Array<{ id: string; name: string }>>(page, `/workspaces/${workspaceId}/accounts`)
	).find(({ name }) => name === accountName)!;
	const refundedSummary = await apiJson<{
		currencies: Array<{
			incomeMinor: string;
			spendingMinor: string;
			groups: Array<{ categoryName: string; amountMinor: string }>;
		}>;
	}>(
		page,
		`/workspaces/${workspaceId}/summary?startDate=2026-01-01&endDate=2026-12-31&accountId=${createdAccount.id}`
	);
	const usdSummary = refundedSummary.currencies.find(({ groups }) =>
		groups.some(({ categoryName }) => categoryName === 'Groceries')
	)!;
	expect(usdSummary.incomeMinor).toBe('0');
	expect(usdSummary.spendingMinor).toBe('1500');
	expect(usdSummary.groups).toContainEqual(
		expect.objectContaining({ categoryName: 'Groceries', amountMinor: '1500' })
	);

	await page.getByRole('link', { name: 'Reconciliation' }).click();
	await page.getByRole('button', { name: 'Add balance snapshot' }).click();
	const snapshotDialog = page.getByRole('dialog');
	await snapshotDialog.getByLabel('Observed balance').fill('120.00');
	await snapshotDialog.getByLabel('Date').fill('2026-07-30');
	await snapshotDialog.getByRole('button', { name: 'Save balance snapshot' }).click();
	const snapshotCard = page.locator('[data-slot="card"]').filter({ hasText: '2026-07-30' });
	await expect(snapshotCard).toContainText(/20,00\sUSD/);

	page.once('dialog', (dialog) => dialog.accept());
	await snapshotCard.getByRole('button', { name: 'Create correction' }).click();
	await expect(page.getByText('Balance correction for snapshot on 2026-07-30')).toBeVisible();
	await expect(accountSummary).toContainText(/105,00\sUSD/);
	await page.reload();
	await expect(accountSummary).toContainText(/105,00\sUSD/);

	await page.goto(`/workspaces/${workspaceId}/transactions`);
	await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
	await page.getByLabel('Search').fill('corner');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page).toHaveURL(/transactions\?query=corner/);
	await expect(
		page.getByRole('cell', { name: 'Corner Market', exact: true }).first()
	).toBeVisible();
	await expect(page.getByRole('cell', { name: 'Full-stack expense', exact: true })).toBeVisible();
});

test('moves a category budget from available to forecast overspend through the real stack', async ({
	page
}) => {
	const email = requiredEnvironment('FULL_STACK_TEST_EMAIL');
	const password = requiredEnvironment('FULL_STACK_TEST_PASSWORD');
	const workspaceId = requiredEnvironment('FULL_STACK_TEST_WORKSPACE_ID');
	await signIn(page, email, password);
	const accounts = await apiJson<Array<{ id: string; name: string; currency: string }>>(
		page,
		`/workspaces/${workspaceId}/accounts`
	);
	const account = accounts.find(({ currency }) => currency === 'PLN')!;
	const category = await apiMutation<{ id: string; name: string }>(
		page,
		`/workspaces/${workspaceId}/categories`,
		'POST',
		{ name: 'Budget journey', idempotencyKey: crypto.randomUUID() }
	);

	await page.goto(`/workspaces/${workspaceId}/budgets`);
	await page.getByLabel('Month', { exact: true }).fill('2026-08');
	await page.getByLabel('Category').click();
	await page.getByRole('option', { name: category.name, exact: true }).click();
	await page.getByLabel('Monthly limit (PLN)').fill('100.00');
	await page.getByRole('button', { name: 'Add budget' }).click();
	const budget = page.locator('[data-slot="card"]').filter({ hasText: category.name }).last();
	await expect(budget).toContainText(/Remaining\s*100,00/);
	await expect(budget).toContainText(/Forecast overspend\s*0,00/);

	await apiMutation(
		page,
		`/workspaces/${workspaceId}/accounts/${account.id}/transactions`,
		'POST',
		{
			kind: 'expense',
			amountMinor: '4000',
			date: '2026-08-02',
			categoryId: category.id,
			description: 'Budget seam completed expense',
			idempotencyKey: crypto.randomUUID()
		}
	);
	await apiMutation(page, `/workspaces/${workspaceId}/plans`, 'POST', {
		accountId: account.id,
		kind: 'expense',
		amountMinor: '8000',
		date: '2026-08-20',
		status: 'expected',
		categoryId: category.id,
		description: 'Budget seam expected expense',
		idempotencyKey: crypto.randomUUID()
	});
	await page.reload();
	await page.getByLabel('Month', { exact: true }).fill('2026-08');
	await expect(budget).toContainText(/Completed\s*40,00/);
	await expect(budget).toContainText(/Expected plans\s*80,00/);
	await expect(budget).toContainText(/Remaining\s*60,00/);
	await expect(budget).toContainText(/Forecast overspend\s*20,00/);
});

test('tracks a categorized card purchase and bill payment once through the real stack', async ({
	page
}) => {
	test.setTimeout(60_000);
	const email = requiredEnvironment('FULL_STACK_TEST_EMAIL');
	const password = requiredEnvironment('FULL_STACK_TEST_PASSWORD');
	const workspaceId = requiredEnvironment('FULL_STACK_TEST_WORKSPACE_ID');
	const cardName = 'Full-stack credit card';

	await page.goto('/sign-in');
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password').fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL('/home');
	await page.goto(`/workspaces/${workspaceId}/accounts`);

	await page.getByRole('button', { name: 'Add account' }).click();
	const accountDialog = page.getByRole('dialog');
	await accountDialog.getByLabel('Name', { exact: true }).fill(cardName);
	await chooseSelect(page, 'Type', 'Credit card');
	await accountDialog.getByLabel('Currency', { exact: true }).click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Enter');
	await accountDialog.getByLabel('Opening date').fill('2026-01-01');
	await accountDialog.getByLabel('Opening card balance').fill('-100.00');
	await accountDialog.getByRole('button', { name: 'Save account' }).click();

	const card = page.locator('[data-slot="card"]').filter({ hasText: cardName });
	await expect(card).toContainText('Credit card · PLN');
	await expect(card).toContainText(/Owed 100,00\s(?:PLN|zł)/);
	await card.getByRole('button', { name: 'View details' }).click();
	await expect(page.getByRole('heading', { name: cardName })).toBeVisible();
	const accountSummary = page.locator('main [data-slot="card"]').filter({ hasText: cardName });
	await expect(accountSummary).toContainText(/Owed 100,00\s(?:PLN|zł)/);

	const accountsBefore = await apiJson<Array<{ id: string; name: string; balanceMinor: string }>>(
		page,
		`/workspaces/${workspaceId}/accounts`
	);
	const bankBefore = accountsBefore.find(({ name }) => name === 'Everyday account')!;
	const cardAccount = accountsBefore.find(({ name }) => name === cardName)!;

	await page.getByRole('button', { name: 'Add transaction' }).click();
	const transactionDialog = page.getByRole('dialog');
	await transactionDialog.getByLabel('Amount', { exact: true }).fill('25.00');
	await chooseSelect(page, 'Category', 'Groceries');
	await transactionDialog.getByLabel('Description').fill('Full-stack card purchase');
	await transactionDialog.getByRole('button', { name: 'Save transaction' }).click();
	await expect(accountSummary).toContainText(/Owed 125,00\s(?:PLN|zł)/);

	await page.getByRole('button', { name: 'New transfer' }).click();
	await page.getByLabel('Source account', { exact: true }).click();
	await page.getByRole('option', { name: /^Everyday account \(PLN\)/ }).click();
	await page.getByLabel('Destination account', { exact: true }).click();
	await page.getByRole('option', { name: new RegExp(`^${cardName} \\(PLN\\)`) }).click();
	await page.getByLabel('Transfer amount').fill('125.00');
	await page.getByLabel('Note').fill('Full-stack card payment');
	await page.getByRole('dialog').getByRole('button', { name: 'Save transfer' }).click();
	await expect(accountSummary).toContainText(/Owed 0,00\s(?:PLN|zł)/);

	const accountsAfter = await apiJson<Array<{ id: string; name: string; balanceMinor: string }>>(
		page,
		`/workspaces/${workspaceId}/accounts`
	);
	assertAccountBalance(accountsAfter, cardAccount.id, '0');
	assertAccountBalance(
		accountsAfter,
		bankBefore.id,
		(BigInt(bankBefore.balanceMinor) - 12500n).toString()
	);
	const transfers = await apiJson<Array<{ amountMinor: string; localSide: string }>>(
		page,
		`/workspaces/${workspaceId}/accounts/${cardAccount.id}/transfers`
	);
	expect(transfers).toContainEqual(
		expect.objectContaining({ amountMinor: '12500', localSide: 'to' })
	);
	const summary = await apiJson<{
		currencies: Array<{
			incomeMinor: string;
			spendingMinor: string;
			groups: Array<{
				categoryName: string;
				transactions: Array<{ description: string | null; amountMinor: string }>;
			}>;
		}>;
	}>(page, `/workspaces/${workspaceId}/summary?startDate=2026-01-01&endDate=2026-12-31`);
	const purchase = summary.currencies
		.flatMap(({ groups }) => groups)
		.find(({ categoryName }) => categoryName === 'Groceries')
		?.transactions.find(({ description }) => description === 'Full-stack card purchase');
	expect(purchase).toEqual(expect.objectContaining({ amountMinor: '2500' }));
	expect(
		summary.currencies
			.flatMap(({ groups }) => groups)
			.flatMap(({ transactions }) => transactions)
			.some(({ description }) => description === 'Full-stack card payment')
	).toBe(false);

	await page.getByRole('button', { name: 'Edit account' }).click();
	await accountDialog.getByLabel('Name', { exact: true }).fill('Reviewed credit card');
	await accountDialog.getByRole('button', { name: 'Save account' }).click();
	await expect(page.getByRole('heading', { name: 'Reviewed credit card' })).toBeVisible();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Archive account' }).click();
	await expect(page.getByRole('button', { name: 'Add transaction' })).toBeHidden();
	const archivedAccounts = await apiJson<Array<{ id: string; archivedAt: string | null }>>(
		page,
		`/workspaces/${workspaceId}/accounts`
	);
	expect(archivedAccounts.find(({ id }) => id === cardAccount.id)?.archivedAt).not.toBeNull();
});

test('allocates and settles a Personal-funded Household expense without sharing its account', async ({
	page,
	browser
}: {
	page: Page;
	browser: Browser;
}) => {
	test.setTimeout(60_000);
	const ownerEmail = requiredEnvironment('FULL_STACK_TEST_EMAIL');
	const ownerPassword = requiredEnvironment('FULL_STACK_TEST_PASSWORD');
	const personalWorkspaceId = requiredEnvironment('FULL_STACK_TEST_WORKSPACE_ID');
	const memberEmail = requiredEnvironment('FULL_STACK_MEMBER_EMAIL');
	const memberPassword = requiredEnvironment('FULL_STACK_MEMBER_PASSWORD');
	const householdId = requiredEnvironment('FULL_STACK_HOUSEHOLD_ID');

	await signIn(page, ownerEmail, ownerPassword);
	const personalAccountsBefore = await apiJson<
		Array<{ id: string; name: string; balanceMinor: string }>
	>(page, `/workspaces/${personalWorkspaceId}/accounts`);
	const sourceAccount = personalAccountsBefore.find(({ name }) => name === 'Everyday account')!;
	const householdAccountsBefore = await apiJson<Array<Record<string, unknown>>>(
		page,
		`/workspaces/${householdId}/accounts`
	);
	await page.goto(`/workspaces/${householdId}/transactions`);
	await page.getByRole('button', { name: 'Add Household expense' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Personal account').click();
	await page.getByRole('option', { name: /^Everyday account ·/ }).click();
	await dialog.getByLabel('Amount', { exact: true }).fill('42.50');
	await dialog.getByLabel('Split').click();
	await page.getByRole('option', { name: 'Custom amounts', exact: true }).click();
	await dialog.getByLabel('Demo User allocation').fill('12.50');
	await dialog.getByLabel('Household Member allocation').fill('30.00');
	await dialog.getByLabel('Category', { exact: true }).click();
	await page.getByRole('option', { name: 'Groceries', exact: true }).click();
	await dialog.getByLabel('Merchant').fill('Private-funded Market');
	await dialog.getByLabel('Description').fill('Shared weekly groceries');
	await dialog.getByRole('button', { name: 'Save Household expense' }).click();

	const sharedExpense = page
		.locator('[data-slot="card"]')
		.filter({ hasText: 'Personal-funded Household expenses' });
	await expect(sharedExpense).toContainText('Private-funded Market');
	await expect(sharedExpense).toContainText('Paid by Demo User');
	await expect(sharedExpense).toContainText(/42,50\s(?:PLN|zł)/);
	const personalAccountsAfter = await apiJson<
		Array<{ id: string; name: string; balanceMinor: string }>
	>(page, `/workspaces/${personalWorkspaceId}/accounts`);
	expect(personalAccountsAfter.find(({ id }) => id === sourceAccount.id)?.balanceMinor).toBe(
		(BigInt(sourceAccount.balanceMinor) - 4250n).toString()
	);
	const ownerProjection = await apiJson<Array<Record<string, unknown>>>(
		page,
		`/workspaces/${householdId}/household-expenses`
	);
	expect(ownerProjection).toHaveLength(1);
	expect(ownerProjection[0]?.allocations).toEqual([
		expect.objectContaining({
			member: expect.objectContaining({ name: 'Demo User' }),
			amountMinor: '1250'
		}),
		expect.objectContaining({
			member: expect.objectContaining({ name: 'Household Member' }),
			amountMinor: '3000'
		})
	]);
	expect(
		await apiJson<Array<Record<string, unknown>>>(page, `/workspaces/${householdId}/accounts`)
	).toEqual(householdAccountsBefore);
	const ownerJson = JSON.stringify(ownerProjection);
	expect(ownerJson).not.toContain(personalWorkspaceId);
	expect(ownerJson).not.toContain(sourceAccount.id);
	expect(ownerJson).not.toContain(sourceAccount.name);
	const summary = await apiJson<{
		currencies: Array<{ spendingMinor: string }>;
	}>(page, `/workspaces/${householdId}/summary?startDate=2026-01-01&endDate=2026-12-31`);
	expect(summary.currencies).toContainEqual(expect.objectContaining({ spendingMinor: '4250' }));

	await page.getByRole('button', { name: 'Record payment' }).click();
	const settlementDialog = page.getByRole('dialog');
	await settlementDialog.getByLabel('From').click();
	await page.getByRole('option', { name: 'Household Member', exact: true }).click();
	await settlementDialog.getByLabel('To').click();
	await page.getByRole('option', { name: 'Demo User', exact: true }).click();
	await settlementDialog.getByLabel('Amount').fill('10.00');
	await settlementDialog.getByLabel('Description').fill('Partial Household settlement');
	await settlementDialog.getByRole('button', { name: 'Save payment' }).click();
	const balances = await apiJson<
		Array<{ member: { name: string }; currency: string; balanceMinor: string }>
	>(page, `/workspaces/${householdId}/settlement-balances`);
	expect(balances).toEqual([
		{
			member: expect.objectContaining({ name: 'Demo User' }),
			currency: 'PLN',
			balanceMinor: '-2000'
		},
		{
			member: expect.objectContaining({ name: 'Household Member' }),
			currency: 'PLN',
			balanceMinor: '2000'
		}
	]);
	await expect(page.getByText('Household Member paid Demo User', { exact: true })).toBeVisible();
	await page.getByText('Member settlement', { exact: true }).scrollIntoViewIfNeeded();
	await page.screenshot({ path: '../../.amp/in/artifacts/household-settlement.png' });
	expect(
		await apiJson<{ currencies: Array<{ spendingMinor: string }> }>(
			page,
			`/workspaces/${householdId}/summary?startDate=2026-01-01&endDate=2026-12-31`
		)
	).toEqual(summary);

	const memberContext = await browser.newContext();
	try {
		const memberPage = await memberContext.newPage();
		await signIn(memberPage, memberEmail, memberPassword);
		await memberPage.goto(`/workspaces/${householdId}/transactions`);
		const memberSharedExpense = memberPage
			.locator('[data-slot="card"]')
			.filter({ hasText: 'Personal-funded Household expenses' });
		await expect(memberSharedExpense).toContainText('Private-funded Market');
		await expect(memberSharedExpense).toContainText('Groceries');
		await expect(memberSharedExpense).toContainText(String(ownerProjection[0]?.date));
		await expect(memberSharedExpense).toContainText('Paid by Demo User');
		await expect(memberPage.getByRole('button', { name: 'Edit' })).toHaveCount(0);
		await expect(memberPage.getByText(sourceAccount.name, { exact: true })).toHaveCount(0);
		const memberProjection = await apiJson<Array<Record<string, unknown>>>(
			memberPage,
			`/workspaces/${householdId}/household-expenses`
		);
		expect(memberProjection[0]).toEqual(
			expect.objectContaining({
				amountMinor: '4250',
				merchant: 'Private-funded Market',
				canManage: false
			})
		);
		const memberJson = JSON.stringify(memberProjection);
		expect(memberJson).not.toContain(personalWorkspaceId);
		expect(memberJson).not.toContain(sourceAccount.id);
		expect(memberJson).not.toContain(sourceAccount.name);
	} finally {
		await memberContext.close();
	}
});

function assertAccountBalance(
	accounts: Array<{ id: string; balanceMinor: string }>,
	accountId: string,
	expected: string
) {
	expect(accounts.find(({ id }) => id === accountId)?.balanceMinor).toBe(expected);
}
