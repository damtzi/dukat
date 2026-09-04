import { expect, test, type Page } from '@playwright/test';

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

async function chooseSelect(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).click();
	await page.getByRole('option', { name: option, exact: true }).click();
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
	await expect(page.getByRole('link', { name: 'Open workspace' })).toBeVisible();

	await page.getByRole('link', { name: 'Open workspace' }).click();
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
	await transactionDialog.getByLabel('Description').fill('Full-stack expense');
	await transactionDialog.getByRole('button', { name: 'Save transaction' }).click();

	const accountSummary = page
		.locator('[data-slot="card"]')
		.filter({ hasText: accountName })
		.first();
	await expect(accountSummary).toContainText(/75,00\sUSD/);

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
	await expect(accountSummary).toContainText(/95,00\sUSD/);
	await page.reload();
	await expect(accountSummary).toContainText(/95,00\sUSD/);
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

function assertAccountBalance(
	accounts: Array<{ id: string; balanceMinor: string }>,
	accountId: string,
	expected: string
) {
	expect(accounts.find(({ id }) => id === accountId)?.balanceMinor).toBe(expected);
}
