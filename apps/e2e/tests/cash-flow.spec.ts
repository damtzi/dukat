import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const workspaceId = 'cash-flow-workspace';
const account = {
	id: 'cash-account',
	name: 'Main account',
	type: 'current',
	currency: 'PLN',
	openingDate: '2025-01-01',
	openingBalanceMinor: '0',
	balanceMinor: '840000',
	negativeBalance: false,
	canDelete: false,
	canArchive: true,
	canRestore: false,
	version: 1,
	archivedAt: null,
	activityStartedAt: '2025-01-01T12:00:00.000Z',
	createdAt: '2025-01-01T12:00:00.000Z',
	updatedAt: '2026-08-27T12:00:00.000Z'
};

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function response(missingRate = false) {
	const transactions = [
		{
			id: 'groceries-one',
			accountId: account.id,
			date: '2026-08-10',
			kind: 'expense',
			amountMinor: '36000',
			description: 'Weekly shop'
		}
	];
	return {
		currencies: [
			{
				currency: 'PLN',
				incomeMinor: '900000',
				spendingMinor: '36000',
				uncategorizedMinor: '0',
				groups: [
					{
						kind: 'expense',
						categoryId: 'groceries',
						categoryName: 'Groceries',
						amountMinor: '36000',
						transactions
					}
				]
			}
		],
		reporting: {
			currency: 'PLN',
			incomeMinor: missingRate ? null : '900000',
			spendingMinor: missingRate ? null : '36000',
			uncategorizedMinor: missingRate ? null : '0',
			netMinor: missingRate ? null : '864000',
			missingRate,
			rates: [],
			months: missingRate
				? []
				: Array.from({ length: 12 }, (_, index) => ({
						month: new Date(Date.UTC(2025, 8 + index, 1)).toISOString().slice(0, 7),
						incomeMinor: index === 11 ? '900000' : '0',
						spendingMinor: index === 11 ? '36000' : '0',
						netMinor: index === 11 ? '864000' : '0'
					})),
			spendingCategories: missingRate
				? []
				: [{ categoryId: 'groceries', categoryName: 'Groceries', amountMinor: '36000' }]
		}
	};
}

async function mock(page: Page, state: 'data' | 'missing' | 'empty' = 'data') {
	const cashFlowRequests: string[] = [];
	await page.route('**/api/**', async (route) => {
		const { pathname, search } = new URL(route.request().url());
		if (pathname === '/api/auth/get-session')
			return json(route, { session: { id: 'cash-session' }, user: { id: 'cash-user' } });
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
		if (pathname === `/api/workspaces/${workspaceId}/accounts`) return json(route, [account]);
		if (pathname === `/api/workspaces/${workspaceId}/categories`) return json(route, []);
		if (pathname === '/api/rates/status')
			return json(route, {
				available: true,
				stale: false,
				latest: { effectiveDate: '2026-08-26' }
			});
		if (pathname === `/api/workspaces/${workspaceId}/balances/converted`)
			return json(route, {
				reportingCurrency: 'PLN',
				totalMinor: '840000',
				missingRate: false,
				rates: []
			});
		if (pathname === `/api/workspaces/${workspaceId}/forecast`)
			return json(route, {
				estimate: true,
				reportingCurrency: 'PLN',
				missingRate: false,
				startingBalanceMinor: '840000',
				endingBalanceMinor: '840000',
				occurrences: [],
				points: [],
				accounts: []
			});
		if (pathname === `/api/workspaces/${workspaceId}/cash-flow`) {
			cashFlowRequests.push(search);
			const result = response(state === 'missing');
			return json(
				route,
				state === 'empty'
					? {
							currencies: [],
							reporting: {
								...result.reporting,
								incomeMinor: '0',
								spendingMinor: '0',
								netMinor: '0',
								months: [],
								spendingCategories: []
							}
						}
					: result
			);
		}
		return json(route, { message: `Unexpected request: ${pathname}` }, 500);
	});
	return cashFlowRequests;
}

async function openSidebar(page: Page) {
	const cashFlowLink = page.getByRole('link', { name: 'Cash flow', exact: true });
	if (await cashFlowLink.isVisible()) return;
	await page.getByRole('main').getByRole('button', { name: 'Toggle Sidebar' }).click();
}

test('navigates, compares periods, exposes chart values, and drills into transactions', async ({
	page
}, testInfo) => {
	test.skip(!['desktop-chromium', 'phone-chromium'].includes(testInfo.project.name));
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.setFixedTime(new Date('2026-08-27T12:00:00Z'));
	const requests = await mock(page);
	await page.goto(`/workspaces/${workspaceId}`);
	await openSidebar(page);
	await page.getByRole('link', { name: 'Cash flow', exact: true }).click();

	await expect(page).toHaveURL(`/workspaces/${workspaceId}/cash-flow`);
	await expect(page.getByRole('heading', { name: 'Cash flow', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: '12 months' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByText('Equivalent-period comparison')).toBeVisible();
	await page.getByRole('button', { name: 'Year to date' }).click();
	await expect
		.poll(() =>
			requests.some(
				(request) =>
					request.includes('startDate=2025-01-01') && request.includes('endDate=2025-08-27')
			)
		)
		.toBe(true);
	await page.getByRole('button', { name: '12 months' }).click();

	const incomeBar = page.getByRole('button', { name: /2026-08 income/ });
	await incomeBar.focus();
	await expect(incomeBar).toBeFocused();
	await expect(page.getByText('All monthly cash-flow values')).toBeVisible();

	await page.getByRole('button', { name: /Groceries/ }).click();
	await expect(page.getByText('Weekly shop')).toBeVisible();
	await page.getByLabel('Filter transactions').fill('not present');
	await expect(page.getByText('Weekly shop')).toBeHidden();

	await page.getByRole('button', { name: 'Custom range' }).click();
	await expect(page.getByRole('textbox', { name: 'Start', exact: true })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'End', exact: true })).toBeVisible();
	if (testInfo.project.name === 'phone-chromium') {
		const income = await page.getByText('Income', { exact: true }).first().boundingBox();
		const spending = await page.getByText('Spending', { exact: true }).first().boundingBox();
		const net = await page.getByText('Net cash flow', { exact: true }).first().boundingBox();
		expect(income!.y).toBeLessThan(spending!.y);
		expect(spending!.y).toBeLessThan(net!.y);
	}

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
});

test('replaces charts with one useful action when data or rates are unavailable', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chromium');
	await mock(page, 'missing');
	await page.goto(`/workspaces/${workspaceId}/cash-flow`);
	await expect(page.getByText('Combined cash flow unavailable')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Review exchange rates' })).toBeVisible();
	await expect(page.getByText('Original-currency totals')).toBeVisible();
	await expect(page.getByText('Monthly income and spending')).toBeHidden();

	await page.unrouteAll({ behavior: 'wait' });
	await mock(page, 'empty');
	await page.reload();
	await expect(page.getByText('No completed transactions in this period')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Import transactions' })).toBeVisible();
});
