import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const workspaceId = 'forecast-workspace';
const accountId = 'forecast-account';
const account = {
	id: accountId,
	name: 'Everyday account',
	type: 'current',
	currency: 'PLN',
	openingDate: '2026-01-01',
	openingBalanceMinor: '50000',
	balanceMinor: '50000',
	negativeBalance: false,
	canDelete: false,
	canArchive: false,
	canRestore: false,
	version: 1,
	archivedAt: null,
	activityStartedAt: '2026-01-01T12:00:00.000Z',
	createdAt: '2026-01-01T12:00:00.000Z',
	updatedAt: '2026-08-27T12:00:00.000Z'
};
const plans = [
	{
		id: 'rent',
		rootPlanId: 'rent',
		workspaceId,
		accountId,
		kind: 'expense',
		amountMinor: '80000',
		date: '2026-09-01',
		effectiveFrom: '2026-09-01',
		status: 'expected',
		description: 'Rent',
		categoryId: null,
		cutoffDate: null,
		cancelled: false,
		version: 1
	},
	{
		id: 'move',
		rootPlanId: 'move',
		workspaceId,
		accountId,
		kind: 'expense',
		amountMinor: '40000',
		date: '2027-01-15',
		effectiveFrom: '2027-01-15',
		status: 'tentative',
		description: 'Possible move',
		categoryId: null,
		cutoffDate: null,
		cancelled: false,
		version: 1
	}
];

function json(route: Route, body: unknown) {
	return route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(body)
	});
}

async function expectNoSeriousAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations.filter((violation) => violation.impact === 'serious')).toEqual([]);
}

function occurrence(
	planId: string,
	date: string,
	status: 'expected' | 'tentative',
	amount: string
) {
	return {
		planId,
		accountId,
		kind: 'expense',
		amountMinor: amount,
		status,
		originalDate: date,
		date,
		sourceCurrency: 'PLN',
		sourceAmountMinor: amount
	};
}

function forecast(state: 'data' | 'missing' | 'empty', includeTentative: boolean) {
	if (state === 'missing')
		return {
			estimate: true,
			reportingCurrency: 'PLN',
			missingRate: true,
			startingBalanceMinor: null,
			endingBalanceMinor: null,
			occurrences: [],
			points: [],
			accounts: [
				{
					id: accountId,
					currency: 'PLN',
					currentBalanceMinor: '50000',
					startingBalanceMinor: '50000',
					endingBalanceMinor: '-70000'
				}
			]
		};
	const expected = occurrence('rent', '2026-09-01', 'expected', '80000');
	const tentative = occurrence('move', '2027-01-15', 'tentative', '40000');
	const occurrences =
		state === 'empty' ? [] : includeTentative ? [expected, tentative] : [expected];
	const points = occurrences.map((item, index) => ({
		...item,
		projectedBalanceMinor: index === 0 ? '-30000' : '-70000'
	}));
	return {
		estimate: true,
		reportingCurrency: 'PLN',
		missingRate: false,
		startingBalanceMinor: '50000',
		endingBalanceMinor: points.at(-1)?.projectedBalanceMinor ?? '50000',
		occurrences,
		points,
		accounts: []
	};
}

async function mock(page: Page, state: 'data' | 'missing' | 'empty' = 'data') {
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname === '/api/auth/get-session')
			return json(route, { session: { id: 'session' }, user: { id: 'user' } });
		if (url.pathname === '/api/favorites') return json(route, []);
		if (url.pathname === '/api/workspaces')
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
		if (url.pathname === `/api/workspaces/${workspaceId}/accounts`) return json(route, [account]);
		if (url.pathname === `/api/workspaces/${workspaceId}/categories`) return json(route, []);
		if (url.pathname === `/api/workspaces/${workspaceId}/plans`) return json(route, plans);
		if (url.pathname === '/api/rates/status')
			return json(route, { available: true, stale: false, latest: null });
		if (url.pathname === `/api/workspaces/${workspaceId}/balances/converted`)
			return json(route, {
				reportingCurrency: 'PLN',
				totalMinor: '50000',
				missingRate: false,
				rates: []
			});
		if (url.pathname === `/api/workspaces/${workspaceId}/forecast`)
			return json(route, forecast(state, url.searchParams.get('includeTentative') === 'true'));
		return route.fulfill({ status: 500, body: `Unexpected request: ${url.pathname}` });
	});
}

async function openSidebar(page: Page) {
	const link = page.getByRole('link', { name: 'Forecast', exact: true });
	if (await link.isVisible()) return;
	await page.getByRole('main').getByRole('button', { name: 'Toggle Sidebar' }).click();
}

test('shows expected and tentative occurrence-level scenarios on desktop and mobile', async ({
	page
}, testInfo) => {
	test.skip(!['desktop-chromium', 'phone-chromium'].includes(testInfo.project.name));
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.setFixedTime(new Date('2026-08-27T12:00:00Z'));
	await mock(page);
	await page.goto(`/workspaces/${workspaceId}`);
	await openSidebar(page);
	await page.getByRole('link', { name: 'Forecast', exact: true }).click();

	await expect(page).toHaveURL(`/workspaces/${workspaceId}/forecast`);
	await expect(page.getByRole('heading', { name: 'Forecast', level: 1 })).toBeVisible();
	await expect(page.getByText('Projected balance', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('Lowest projected balance', { exact: true })).toBeVisible();
	await expect(page.getByText('-300,00 zł').first()).toBeVisible();
	await expect(page.getByText('Expected', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('Tentative', { exact: true }).first()).toBeVisible();

	const occurrenceLink = page.getByRole('link', { name: /Rent.*Expected.*Everyday account/ });
	await occurrenceLink.focus();
	await expect(occurrenceLink).toBeFocused();
	const occurrenceDetails =
		testInfo.project.name === 'phone-chromium'
			? page.getByRole('list', { name: 'Forecast occurrences' })
			: page.getByRole('table', { name: 'Forecast occurrences' });
	await expect(occurrenceDetails).toContainText('Possible move');
	await expect(
		page.getByRole('link', { name: 'Manage Everyday account plans' }).first()
	).toHaveAttribute('href', `/workspaces/${workspaceId}/accounts/${accountId}/planning`);

	if (testInfo.project.name === 'phone-chromium') {
		await expect(page.getByRole('dialog', { name: 'Sidebar' })).toBeHidden();
		const current = await page.getByText('Current balance', { exact: true }).boundingBox();
		const projected = await page
			.getByText('Projected balance', { exact: true })
			.first()
			.boundingBox();
		const lowest = await page.getByText('Lowest projected balance', { exact: true }).boundingBox();
		expect(current!.y).toBeLessThan(projected!.y);
		expect(projected!.y).toBeLessThan(lowest!.y);
	} else {
		const forecastLink = page.getByRole('link', { name: 'Forecast', exact: true });
		await expect(forecastLink).toHaveAttribute('aria-current', 'page');
		const sidebar = page.locator('[data-slot="sidebar"][data-state]');
		if ((await sidebar.getAttribute('data-state')) === 'expanded')
			await page.getByRole('main').getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
		await expect(forecastLink).toBeVisible();
	}

	await page.screenshot({
		path: `../../.amp/in/artifacts/forecast-${testInfo.project.name}.png`,
		fullPage: true
	});

	await expectNoSeriousAxeViolations(page);
});

test('replaces the chart for missing rates and no plans', async ({ page }) => {
	await mock(page, 'missing');
	await page.goto(`/workspaces/${workspaceId}/forecast`);
	await expect(page.getByText('Combined forecast unavailable')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Review exchange rates' })).toBeVisible();
	await expect(page.getByText('Original-currency account forecasts')).toBeVisible();
	await expect(page.getByText('Everyday account').last()).toBeVisible();
	await expect(page.getByText('Expected and tentative outlook')).toBeHidden();
	await expectNoSeriousAxeViolations(page);

	await page.unrouteAll({ behavior: 'wait' });
	await mock(page, 'empty');
	await page.reload();
	await expect(page.getByText('No planned transactions')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Manage planned transactions' })).toHaveAttribute(
		'href',
		`/workspaces/${workspaceId}/accounts/${accountId}/planning`
	);
	await expect(page.getByText('Expected and tentative outlook')).toBeHidden();
	await expectNoSeriousAxeViolations(page);
});
