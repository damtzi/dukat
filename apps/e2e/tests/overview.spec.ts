import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const workspaceId = 'overview-workspace';
const accounts = [
	account('checking', 'Everyday checking', 'PLN', '120000'),
	account('debt', 'Large overdraft', 'PLN', '-90000'),
	account('savings', 'Savings reserve', 'PLN', '50000'),
	account('cash', 'Pocket cash', 'PLN', '1000'),
	account('archived', 'Old account', 'PLN', '999000', '2026-01-01T00:00:00.000Z')
];

function account(
	id: string,
	name: string,
	currency: string,
	balanceMinor: string,
	archivedAt: string | null = null
) {
	return {
		id,
		name,
		type: 'current',
		currency,
		openingBalanceMinor: balanceMinor,
		balanceMinor,
		negativeBalance: BigInt(balanceMinor) < 0n,
		canDelete: false,
		canArchive: false,
		canRestore: false,
		version: 1,
		archivedAt,
		activityStartedAt: '2026-01-01T12:00:00.000Z',
		createdAt: '2026-01-01T12:00:00.000Z',
		updatedAt: '2026-08-27T12:00:00.000Z'
	};
}

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({
		status,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
}

async function expectNoSeriousAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations.filter(({ impact }) => impact === 'serious')).toEqual([]);
}

async function chooseSelect(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).click();
	await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

type State = 'data' | 'no-accounts' | 'no-plans' | 'missing-rate' | 'no-transactions';

function cashFlowResponse(state: State, previous: boolean) {
	const empty = state === 'no-transactions';
	const missingRate = state === 'missing-rate';
	const incomeMinor = previous ? '700000' : '900000';
	const spendingMinor = previous ? '300000' : '360000';
	const categories = [
		['groceries', 'Groceries', '90000'],
		['housing', 'Housing', '80000'],
		['transport', 'Transport', '70000'],
		['health', 'Health', '50000'],
		['leisure', 'Leisure', '30000'],
		['gifts', 'Gifts', '25000'],
		['fees', 'Fees', '15000']
	] as const;
	return {
		currencies: empty
			? []
			: [
					{
						currency: 'PLN',
						incomeMinor,
						spendingMinor,
						uncategorizedMinor: '0',
						groups: []
					}
				],
		reporting: {
			currency: 'PLN',
			incomeMinor: missingRate ? null : empty ? '0' : incomeMinor,
			spendingMinor: missingRate ? null : empty ? '0' : spendingMinor,
			uncategorizedMinor: missingRate ? null : '0',
			netMinor: missingRate
				? null
				: empty
					? '0'
					: (BigInt(incomeMinor) - BigInt(spendingMinor)).toString(),
			missingRate,
			rates: [],
			months: [],
			spendingCategories:
				missingRate || empty || previous
					? []
					: categories.map(([categoryId, categoryName, amountMinor]) => ({
							categoryId,
							categoryName,
							amountMinor
						}))
		}
	};
}

async function mockOverview(page: Page, state: State = 'data') {
	let savingsBalance = 50000n;
	const requests: Array<{ pathname: string; body: Record<string, unknown> }> = [];
	const currentAccounts = () =>
		state === 'no-accounts'
			? []
			: accounts.map((item) =>
					item.id === 'savings'
						? {
								...item,
								balanceMinor: savingsBalance.toString(),
								openingBalanceMinor: savingsBalance.toString()
							}
						: item
				);
	const currentTotal = () => 31000n + savingsBalance;

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const method = request.method();
		const pathname = url.pathname;

		if (pathname === '/api/auth/get-session')
			return json(route, {
				session: { id: 'session' },
				user: { id: 'user' }
			});
		if (pathname === '/api/favorites') return json(route, []);
		if (pathname === '/api/workspaces')
			return json(route, [
				{
					id: workspaceId,
					name: 'Personal',
					type: 'personal',
					reportingCurrency: 'PLN',
					version: 1,
					role: null
				}
			]);
		if (pathname === '/api/rates/status')
			return json(route, { available: true, stale: false, latest: null });
		if (pathname === `/api/workspaces/${workspaceId}/accounts`)
			return json(route, currentAccounts());
		if (pathname === `/api/workspaces/${workspaceId}/categories`) return json(route, []);
		if (pathname === `/api/workspaces/${workspaceId}/plans`) return json(route, []);
		if (pathname === `/api/workspaces/${workspaceId}/balances/converted`)
			return json(route, {
				reportingCurrency: 'PLN',
				totalMinor: state === 'missing-rate' ? null : currentTotal().toString(),
				missingRate: state === 'missing-rate',
				rates: [],
				accounts: currentAccounts().map((item) => ({
					...item,
					convertedBalanceMinor:
						state === 'missing-rate' && item.id === 'savings' ? null : item.balanceMinor,
					rates: []
				}))
			});
		if (pathname === `/api/workspaces/${workspaceId}/forecast`) {
			const includeTentative = url.searchParams.get('includeTentative') === 'true';
			const noPlans = state === 'no-plans' || state === 'no-accounts';
			const expected = occurrence(
				'rent',
				'checking',
				'expected',
				'2026-09-01',
				(currentTotal() - 100000n).toString()
			);
			const tentative = occurrence(
				'move',
				'savings',
				'tentative',
				'2027-01-15',
				(currentTotal() - 140000n).toString()
			);
			const points = noPlans ? [] : includeTentative ? [expected, tentative] : [expected];
			return json(route, {
				estimate: true,
				reportingCurrency: 'PLN',
				missingRate: state === 'missing-rate',
				startingBalanceMinor: state === 'missing-rate' ? null : currentTotal().toString(),
				endingBalanceMinor:
					state === 'missing-rate'
						? null
						: (points.at(-1)?.projectedBalanceMinor ?? currentTotal()).toString(),
				occurrences: points.map(
					({ projectedBalanceMinor: _projectedBalanceMinor, ...item }) => item
				),
				points,
				accounts: []
			});
		}
		if (pathname === `/api/workspaces/${workspaceId}/cash-flow`) {
			return json(
				route,
				cashFlowResponse(state, url.searchParams.get('startDate') === '2026-07-01')
			);
		}
		if (
			pathname === `/api/workspaces/${workspaceId}/accounts/savings/transactions` &&
			method === 'POST'
		) {
			const body = request.postDataJSON() as Record<string, unknown>;
			requests.push({ pathname, body });
			savingsBalance += BigInt(body.amountMinor as string);
			return json(route, { id: 'income-1', ...body, version: 1 }, 201);
		}
		return route.fulfill({
			status: 500,
			body: `Unexpected request: ${method} ${pathname}`
		});
	});

	return requests;
}

function occurrence(
	planId: string,
	accountId: string,
	status: 'expected' | 'tentative',
	date: string,
	projectedBalanceMinor: string
) {
	return {
		planId,
		accountId,
		kind: 'expense',
		amountMinor: '100000',
		status,
		originalDate: date,
		date,
		sourceCurrency: 'PLN',
		sourceAmountMinor: '100000',
		projectedBalanceMinor
	};
}

test('shows the Now to Ahead summary and ranked account preview', async ({ page }, testInfo) => {
	test.skip(!['desktop-chromium', 'phone-chromium'].includes(testInfo.project.name));
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.setFixedTime(new Date('2026-08-27T12:00:00Z'));
	await mockOverview(page);
	await page.goto(`/workspaces/${workspaceId}`);

	await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
	await expect(page.getByText('Financial cockpit')).toHaveCount(0);
	await expect(page.getByText('Your balance', { exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Outlook', level: 2 })).toBeVisible();
	await expect(page.getByText('810,00 zł', { exact: true })).toBeVisible();
	await expect(page.getByText('Projected ending balance')).toBeVisible();
	await expect(page.getByText('Lowest projected balance')).toBeVisible();
	await expect(page.getByText(/These values may change and are not guaranteed/)).toBeVisible();
	await expect(page.getByText(/subtle dotted line/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'View forecast' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/forecast`
	);
	const thisMonthCard = page
		.getByText('This month', { exact: true })
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(thisMonthCard).toContainText('9000,00 zł');
	await expect(thisMonthCard).toContainText('3600,00 zł');
	await expect(thisMonthCard).toContainText('5400,00 zł');
	await expect(thisMonthCard).toContainText('Aug 1, 2026–Aug 27, 2026');
	await expect(thisMonthCard).toContainText('Jul 1, 2026–Jul 27, 2026');
	await expect(thisMonthCard).toContainText('Difference in net cash flow: 1400,00 zł');
	await expect(thisMonthCard).toContainText('Groceries');
	await expect(thisMonthCard).toContainText('Other');
	await expect(thisMonthCard).toContainText('400,00 zł');
	await expect(page.getByRole('link', { name: 'View cash flow' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/cash-flow`
	);
	await expect(page.getByRole('button', { name: '12 months' })).toHaveCount(0);
	for (const name of [
		/Aug 1, 2026–Aug 27, 2026 income/,
		/Aug 1, 2026–Aug 27, 2026 spending/,
		/Jul 1, 2026–Jul 27, 2026 income/,
		/Jul 1, 2026–Jul 27, 2026 spending/
	]) {
		const cashFlowBar = page.getByRole('button', { name });
		await cashFlowBar.focus();
		await expect(cashFlowBar).toBeFocused();
	}
	const previousIncomeBar = page.getByRole('button', {
		name: /Jul 1, 2026–Jul 27, 2026 income/
	});
	const currentIncomeBar = page.getByRole('button', {
		name: /Aug 1, 2026–Aug 27, 2026 income/
	});
	expect((await previousIncomeBar.boundingBox())!.x).toBeLessThan(
		(await currentIncomeBar.boundingBox())!.x
	);
	await expect(page.getByText('All compared cash-flow values')).toBeVisible();

	const point = page.getByRole('link', {
		name: /Expense, Everyday checking.*Expected/
	});
	await point.focus();
	await expect(point).toBeFocused();
	const tentativePoint = page.getByRole('link', {
		name: /Expense, Savings reserve.*Tentative/
	});
	await tentativePoint.focus();
	await expect(tentativePoint).toBeFocused();
	await expect(page.getByRole('img', { name: /12-month projected balance/ })).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator('svg path')
				.first()
				.evaluate((path) => ({
					animationName: getComputedStyle(path).animationName,
					transitionDuration: getComputedStyle(path).transitionDuration
				}))
		)
		.toEqual({ animationName: 'none', transitionDuration: '0s' });

	const overview = page.getByRole('region', { name: 'Overview' });
	const preview = overview
		.getByText('Significant active balances')
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(preview).toContainText('Everyday checking');
	await expect(preview).toContainText('Large overdraft');
	await expect(preview).toContainText('Savings reserve');
	await expect(preview).not.toContainText('Pocket cash');
	await expect(preview).not.toContainText('Old account');
	await expect(page.getByRole('link', { name: 'View all accounts' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/accounts`
	);

	if (testInfo.project.name === 'phone-chromium') {
		const balance = await page.getByText('Your balance', { exact: true }).boundingBox();
		const outlook = await page.getByRole('heading', { name: 'Outlook', level: 2 }).boundingBox();
		const thisMonth = await page.getByText('This month', { exact: true }).boundingBox();
		const accountsHeading = await overview.getByText('Accounts', { exact: true }).boundingBox();
		expect(balance!.y).toBeLessThan(outlook!.y);
		expect(outlook!.y).toBeLessThan(thisMonth!.y);
		expect(thisMonth!.y).toBeLessThan(accountsHeading!.y);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			await page.evaluate(() => window.innerWidth)
		);
	} else {
		const accountsCard = overview
			.getByText('Accounts', { exact: true })
			.locator('xpath=ancestor::*[@data-slot="card"][1]');
		const thisMonthBox = await thisMonthCard.boundingBox();
		const accountsBox = await accountsCard.boundingBox();
		expect(thisMonthBox!.width / accountsBox!.width).toBeGreaterThan(1.7);
	}

	await expectNoSeriousAxeViolations(page);
	await point.click();
	await expect(page).toHaveURL(`/workspaces/${workspaceId}/accounts/checking/planning`);
});

test('uses direct empty and missing-rate states', async ({ page }) => {
	await mockOverview(page, 'no-accounts');
	await page.goto(`/workspaces/${workspaceId}`);
	await expect(page.getByText('No accounts', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
	await expect(page.getByText('Outlook: 12-month projected balance')).toHaveCount(0);

	await page.unrouteAll({ behavior: 'wait' });
	await mockOverview(page, 'no-plans');
	await page.reload();
	await expect(page.getByText('No planned transactions')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Manage planned transactions' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/accounts/checking/planning`
	);
	await expect(page.getByText('Outlook: 12-month projected balance')).toHaveCount(0);

	await page.unrouteAll({ behavior: 'wait' });
	await mockOverview(page, 'missing-rate');
	await page.reload();
	const missingRateCard = page
		.getByText('Combined outlook unavailable')
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(missingRateCard).toBeVisible();
	await expect(missingRateCard).toContainText('1200,00 zł');
	await expect(missingRateCard).toContainText('500,00 zł');
	await expect(
		missingRateCard.getByRole('link', { name: 'Review exchange rates' })
	).toHaveAttribute('href', `/workspaces/${workspaceId}/rates`);
	const missingCashFlow = page
		.getByText('Combined cash flow unavailable')
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(missingCashFlow).toContainText('PLN');
	await expect(missingCashFlow.getByRole('link')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Review exchange rates' })).toHaveCount(1);
	await expect(page.getByText('Income and spending comparison')).toBeHidden();
	await expect(page.getByText('Outlook: 12-month projected balance')).toHaveCount(0);
	await expectNoSeriousAxeViolations(page);
});

test('replaces the monthly charts when there are no completed transactions', async ({ page }) => {
	await mockOverview(page, 'no-transactions');
	await page.goto(`/workspaces/${workspaceId}`);

	await expect(page.getByText('No completed transactions this month')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Import transactions' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/imports`
	);
	await expect(page.getByText('Income and spending comparison')).toBeHidden();
	await expect(page.getByText('Top spending categories')).toBeHidden();
	await expectNoSeriousAxeViolations(page);
});

test('adds a transaction to a chosen account and refreshes overview values', async ({ page }) => {
	const requests = await mockOverview(page);
	await page.goto(`/workspaces/${workspaceId}`);
	await page.getByRole('button', { name: 'Add transaction' }).click();

	await chooseSelect(page, 'Account', 'Savings reserve');
	await chooseSelect(page, 'Kind', 'Income');
	await page.getByLabel('Amount', { exact: true }).fill('200.00');
	await page.getByLabel('Description', { exact: true }).fill('Salary');
	await page.getByRole('button', { name: 'Save transaction' }).click();

	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(
		page.getByRole('region', { name: 'Overview' }).getByText('1010,00 zł', { exact: true })
	).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0]?.pathname).toBe(
		`/api/workspaces/${workspaceId}/accounts/savings/transactions`
	);
	expect(requests[0]?.body).toMatchObject({
		kind: 'income',
		amountMinor: '20000',
		description: 'Salary'
	});
});
