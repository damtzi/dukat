import { expect, test } from '@playwright/test';

function requiredEnvironment(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}. Run this test through the full-stack command.`);
	return value;
}

test('signs in and persists a manual transaction through the real stack', async ({ page }) => {
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
	await page.reload();
	await expect(accountSummary).toContainText(/75,00\sUSD/);
});
