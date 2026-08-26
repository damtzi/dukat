import { expect, test, type Page, type Route } from '@playwright/test';

const workspaceId = 'rates-proof-workspace';
const now = '2026-08-06T12:00:00.000Z';
const accounts = [
	{
		id: 'eur-proof',
		name: 'Euro wallet',
		type: 'cash',
		currency: 'EUR',
		openingBalanceMinor: '10000',
		balanceMinor: '10000',
		negativeBalance: false,
		canDelete: false,
		canArchive: false,
		canRestore: false,
		version: 1,
		archivedAt: null,
		activityStartedAt: now,
		createdAt: now,
		updatedAt: now
	},
	{
		id: 'usd-proof',
		name: 'Dollar account',
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '5000',
		balanceMinor: '5000',
		negativeBalance: false,
		canDelete: false,
		canArchive: false,
		canRestore: false,
		version: 1,
		archivedAt: null,
		activityStartedAt: now,
		createdAt: now,
		updatedAt: now
	}
];
const eurRate = {
	currency: 'EUR',
	rateToPln: '4.3',
	source: 'NBP',
	effectiveDate: '2026-08-05',
	tableNumber: '151/A/NBP/2026',
	manualOverrideId: null,
	reason: null,
	actorDisplay: null
};
const usdRate = {
	currency: 'USD',
	rateToPln: '4',
	source: 'NBP',
	effectiveDate: '2026-08-05',
	tableNumber: '151/A/NBP/2026',
	manualOverrideId: null,
	reason: null,
	actorDisplay: null
};

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function chooseSelect(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).click();
	await page.getByRole('option', { name: option }).filter({ visible: true }).click();
}

async function mockRates(page: Page, options: { householdMember?: boolean } = {}) {
	let manualRates: Array<Record<string, unknown>> = [];
	let transfer: Record<string, unknown> | undefined;
	let submittedTransfer: Record<string, unknown> | undefined;
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname } = new URL(request.url());
		const method = request.method();
		const body = request.postDataJSON?.() as Record<string, string> | null;
		if (pathname === '/api/auth/get-session')
			return json(route, { session: { id: 'proof-session' }, user: { id: 'proof-user' } });
		if (pathname === '/api/workspaces' && method === 'GET')
			return json(route, [
				{
					id: workspaceId,
					name: options.householdMember ? 'Shared rates' : 'Personal rates',
					type: options.householdMember ? 'household' : 'personal',
					reportingCurrency: 'USD',
					version: 1,
					role: options.householdMember ? 'member' : null
				}
			]);
		if (pathname === `/api/workspaces/${workspaceId}/accounts` && method === 'GET')
			return json(route, accounts);
		if (pathname === `/api/workspaces/${workspaceId}/categories` && method === 'GET')
			return json(route, []);
		if (pathname === `/api/workspaces/${workspaceId}/imports` && method === 'GET')
			return json(route, []);
		if (pathname === `/api/workspaces/${workspaceId}/members` && method === 'GET')
			return json(route, [
				{ userId: 'proof-user', name: 'Proof User', email: 'proof@example.test', role: 'member' }
			]);
		if (pathname === `/api/workspaces/${workspaceId}/summary` && method === 'GET')
			return json(route, {
				reporting: {
					currency: 'USD',
					incomeMinor: '10750',
					spendingMinor: '2500',
					uncategorizedMinor: '0',
					missingRate: false,
					rates: [eurRate, usdRate]
				},
				currencies: []
			});
		if (pathname === '/api/rates/status' && method === 'GET')
			return json(route, {
				available: true,
				stale: false,
				latest: { effectiveDate: '2026-08-05' }
			});
		if (pathname === `/api/workspaces/${workspaceId}/balances/converted` && method === 'GET')
			return json(route, {
				reportingCurrency: 'USD',
				totalMinor: '15750',
				missingRate: false,
				rates: [eurRate, usdRate],
				accounts: [
					{ ...accounts[0], convertedBalanceMinor: '10750', rates: [eurRate, usdRate] },
					{ ...accounts[1], convertedBalanceMinor: '5000', rates: [] }
				]
			});
		if (pathname === `/api/workspaces/${workspaceId}/rates` && method === 'GET')
			return json(route, manualRates);
		if (pathname === `/api/workspaces/${workspaceId}/rates/manual` && method === 'POST') {
			expect(body).toEqual({
				currency: 'CHF',
				rateToPln: '4.5',
				effectiveDate: '2026-08-01',
				reason: 'Statement settlement rate'
			});
			const rate = {
				id: 'manual-proof',
				workspaceId,
				...body,
				actorUserId: 'proof-user',
				actorDisplay: 'Proof User',
				removedAt: null,
				createdAt: now
			};
			manualRates = [rate];
			return json(route, rate);
		}
		if (pathname === `/api/workspaces/${workspaceId}/rates/quote` && method === 'POST') {
			const amount = BigInt(body!.amountMinor);
			return json(route, {
				available: true,
				suggestedAmountMinor: ((amount * 43n + 20n) / 40n).toString(),
				rates: [eurRate, usdRate]
			});
		}
		for (const account of accounts) {
			if (
				pathname === `/api/workspaces/${workspaceId}/accounts/${account.id}/transactions` &&
				method === 'GET'
			)
				return json(route, []);
			if (
				method === 'GET' &&
				['balance-checks', 'corrections'].some(
					(entity) => pathname === `/api/workspaces/${workspaceId}/accounts/${account.id}/${entity}`
				)
			)
				return json(route, []);
			if (
				pathname === `/api/workspaces/${workspaceId}/accounts/${account.id}/transfers` &&
				method === 'GET'
			)
				return json(route, transfer ? [transfer] : []);
		}
		if (pathname === `/api/workspaces/${workspaceId}/transfers` && method === 'POST') {
			submittedTransfer = body!;
			transfer = {
				id: 'transfer-proof',
				date: body!.date,
				description: body!.description,
				version: 1,
				trashedAt: null,
				detachedAt: null,
				createdAt: now,
				updatedAt: now,
				localSide: 'from',
				accountId: 'eur-proof',
				amountMinor: body!.amountMinor,
				sentAmountMinor: body!.amountMinor,
				receivedAmountMinor: body!.receivedAmountMinor,
				canManage: true,
				counterparty: {
					visibility: 'full',
					workspaceId,
					accountId: 'usd-proof',
					name: 'Dollar account'
				}
			};
			return json(route, transfer, 201);
		}
		return json(route, { message: `Unexpected request: ${method} ${pathname}` }, 500);
	});
	return { submittedTransfer: () => submittedTransfer };
}

test('proves exchange-rate management, provenance, quote confirmation, and exact transfer', async ({
	browser
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chromium');
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1000 },
		recordVideo: { dir: '../../.amp/in/artifacts', size: { width: 1440, height: 1000 } }
	});
	const page = await context.newPage();
	const state = await mockRates(page);
	await page.goto(`/workspaces/${workspaceId}`);
	await expect(page.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
		'data-active',
		'true'
	);
	await expect(page.getByRole('link', { name: 'Transactions', exact: true })).toHaveAttribute(
		'data-active',
		'false'
	);
	await expect(page.getByText('Combined balance', { exact: true })).toBeVisible();
	await expect(page.getByText(/^157,50\sUSD$/)).toBeVisible();
	await expect(
		page.getByText(/EUR 4.3 PLN · NBP 151\/A\/NBP\/2026 · 2026-08-05/).first()
	).toBeVisible();
	await page.waitForTimeout(500);
	await page.screenshot({
		path: '../../.amp/in/artifacts/overview-dashboard-proof.png',
		fullPage: true
	});

	await page.getByRole('link', { name: 'Exchange rates', exact: true }).click();
	await page.getByLabel('Currency', { exact: true }).fill('CHF');
	await page.getByLabel('Rate to PLN').fill('4.5');
	await page.getByLabel('Effective date').fill('2026-08-01');
	await page.getByLabel('Reason').fill('Statement settlement rate');
	await page.getByRole('button', { name: 'Add manual rate' }).click();
	await expect(page.getByText(/CHF 4.5 PLN/)).toBeVisible();
	await expect(page.getByText(/Statement settlement rate · Proof User/)).toBeVisible();
	await page.waitForTimeout(750);
	await page.screenshot({
		path: '../../.amp/in/artifacts/exchange-rates-dashboard-proof.png',
		fullPage: true
	});

	const euroAccount = page.getByRole('link', { name: /Euro wallet/ });
	await euroAccount.click();
	await expect(euroAccount).toHaveAttribute('data-active', 'true');
	await expect(page.getByRole('heading', { name: 'Euro wallet', level: 1 })).toBeVisible();
	await page.screenshot({
		path: '../../.amp/in/artifacts/account-dashboard-proof.png',
		fullPage: true
	});
	await page.getByRole('button', { name: 'New transfer' }).click();
	await expect(page.getByLabel('Source account')).toContainText('Euro wallet (EUR)');
	await chooseSelect(page, 'Destination account', 'Dollar account (USD)');
	await page.getByLabel('Transfer amount').fill('10.00');
	await expect(page.getByText(/Suggested 10,75\sUSD/)).toBeVisible();
	await expect(page.getByLabel('Exact amount received')).toHaveValue('');
	await page.waitForTimeout(750);
	await page.getByRole('button', { name: 'Use suggestion' }).click();
	await expect(page.getByLabel('Exact amount received')).toHaveValue('10,75');
	await page.waitForTimeout(750);
	await page.getByLabel('Transfer amount').fill('20.00');
	await expect(page.getByText(/Suggested 21,50\sUSD/)).toBeVisible();
	await expect(page.getByLabel('Exact amount received')).toHaveValue('');
	await page.waitForTimeout(750);
	await page.getByRole('button', { name: 'Use suggestion' }).click();
	await expect(page.getByLabel('Exact amount received')).toHaveValue('21,50');
	await page.waitForTimeout(750);
	await page.getByLabel('Note').fill('Rate proof transfer');
	await page.screenshot({ path: '../../.amp/in/artifacts/exchange-rate-quote-proof.png' });
	await page.getByRole('dialog').locator('form').dispatchEvent('submit');
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(page.getByText('Outgoing transfer')).toBeVisible();
	await page.waitForTimeout(750);
	expect(state.submittedTransfer()).toMatchObject({
		fromAccountId: 'eur-proof',
		toAccountId: 'usd-proof',
		amountMinor: '2000',
		receivedAmountMinor: '2150',
		description: 'Rate proof transfer'
	});
	const video = page.video();
	await context.close();
	await video?.saveAs('../../.amp/in/artifacts/exchange-rates-e2e-proof.webm');
});

test('manual rates remain available to a household member on a phone', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'phone-chromium');
	await mockRates(page, { householdMember: true });
	await page.goto(`/workspaces/${workspaceId}`);
	await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
	await page.getByRole('link', { name: 'Exchange rates', exact: true }).click();
	await expect(page.getByText('Manual exchange rates', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
	await page.getByRole('link', { name: 'Settings', exact: true }).click();
	await expect(page.getByText('Household settings', { exact: true })).toBeVisible();
	await page.screenshot({
		path: '../../.amp/in/artifacts/exchange-rates-member-mobile-proof.png',
		fullPage: true
	});
});
