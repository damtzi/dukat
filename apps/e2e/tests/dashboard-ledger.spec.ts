import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

type Favorite = {
	id: string;
	path: string;
	label: string;
};

const workspaceId = 'workspace-e2e';
const accountId = 'account-e2e';
const key = expect.stringMatching(/^\d+-[0-9a-f-]{36}$/);
const personalWorkspace = {
	id: workspaceId,
	name: 'Personal',
	type: 'personal' as const,
	reportingCurrency: 'USD',
	version: 1,
	role: null
};

function json(route: Route, body: unknown, status = 200) {
	return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function chooseSelect(page: Page, label: string, option: string) {
	await page.getByLabel(label, { exact: true }).filter({ visible: true }).click();
	await page.getByRole('option', { name: option }).filter({ visible: true }).click();
}

async function openSidebar(page: Page) {
	if ((page.viewportSize()?.width ?? 0) < 768) {
		if (await page.getByRole('dialog', { name: 'Sidebar' }).isVisible()) return;
		await page.getByRole('main').getByRole('button', { name: 'Toggle Sidebar' }).click();
		await expect(page.getByRole('dialog', { name: 'Sidebar' })).toBeVisible();
		return;
	}

	const sidebar = page.locator('[data-slot="sidebar"][data-state]');
	if ((await sidebar.getAttribute('data-state')) === 'expanded') return;
	await page.getByRole('main').getByRole('button', { name: 'Toggle Sidebar' }).click();
	await expect(sidebar).toHaveAttribute('data-state', 'expanded');
}

async function clickSidebarLink(page: Page, name: string | RegExp) {
	await openSidebar(page);
	const link = page.getByRole('link', { name });
	const mobileSidebarOpen = await page.getByRole('dialog', { name: 'Sidebar' }).isVisible();
	await link.click();
	if (mobileSidebarOpen) await expect(page.getByRole('dialog', { name: 'Sidebar' })).toBeHidden();
}

function emptyInsightsResponse(path: string, method: string): unknown | undefined {
	if (method !== 'GET' || !path.startsWith('/api/workspaces/')) return undefined;
	if (path.endsWith('/categories') || path.endsWith('/imports')) return [];
	if (path.endsWith('/summary')) return { currencies: [] };
	return undefined;
}

async function mockLedger(page: Page, initialFavorites: Favorite[] = []) {
	let account: Account | undefined;
	const transactions: Transaction[] = [];
	let transactionNumber = 0;
	let favoriteNumber = 0;
	let favorites = [...initialFavorites];

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
		if (pathname === '/api/favorites' && method === 'GET') return json(route, favorites);
		if (pathname === '/api/favorites' && method === 'POST') {
			const favorite = {
				id: `favorite-${++favoriteNumber}`,
				path: body!.path as string,
				label: body!.label as string
			};
			favorites = [...favorites, favorite];
			return json(route, favorite, 201);
		}
		const favoriteId = pathname.match(/^\/api\/favorites\/(.+)$/)?.[1];
		if (favoriteId && method === 'DELETE') {
			favorites = favorites.filter(({ id }) => id !== favoriteId);
			return route.fulfill({ status: 204 });
		}
		if (pathname === '/api/workspaces' && method === 'GET') {
			return json(route, [personalWorkspace]);
		}
		if (pathname === '/api/rates/status' && method === 'GET') {
			return json(route, { available: true, stale: false, latest: null });
		}
		if (pathname === `/api/workspaces/${workspaceId}/categories` && method === 'GET') {
			return json(route, []);
		}
		if (pathname === `/api/workspaces/${workspaceId}/summary` && method === 'GET') {
			return json(route, { currencies: [] });
		}
		if (pathname === `/api/workspaces/${workspaceId}/imports` && method === 'GET') {
			return json(route, []);
		}
		if (pathname === `/api/workspaces/${workspaceId}/rates` && method === 'GET') {
			return json(route, []);
		}
		if (pathname === `/api/workspaces/${workspaceId}/plans` && method === 'GET') {
			return json(route, []);
		}
		if (pathname === `/api/workspaces/${workspaceId}/forecast` && method === 'GET') {
			return json(route, {
				estimate: true,
				reportingCurrency: 'USD',
				missingRate: false,
				startingBalanceMinor: balance().toString(),
				endingBalanceMinor: balance().toString(),
				occurrences: [],
				points: [],
				accounts: []
			});
		}
		if (pathname === `/api/workspaces/${workspaceId}/balances/converted` && method === 'GET') {
			return json(route, {
				reportingCurrency: 'USD',
				totalMinor: balance().toString(),
				missingRate: false,
				rates: [],
				accounts: []
			});
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
							categoryId: null,
							date: body!.date,
							idempotencyKey: key
						}
					: {
							kind: 'income',
							amountMinor: '2500',
							description: 'Refund',
							categoryId: null,
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
				categoryId: null,
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
		if (
			pathname === `/api/workspaces/${workspaceId}/accounts/${accountId}/archive-impact` &&
			method === 'GET'
		) {
			return json(route, {
				accountVersion: account!.version,
				date: '2026-08-07',
				impactToken: 'no-plans-impact',
				plans: []
			});
		}
		if (accountAction && method === 'POST') {
			expect(body).toEqual({
				version: account!.version,
				idempotencyKey: key,
				...(accountAction[1] === 'archive' ? { impactToken: 'no-plans-impact' } : {})
			});
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

test('keeps authentication keyboard-operable with no automated accessibility violations', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chromium');
	await page.route('**/api/auth/get-session', (route) => json(route, null));
	await page.route('**/api/auth/sign-in/email', (route) =>
		json(route, { message: 'Email or password is incorrect.' }, 401)
	);
	await page.goto('/sign-in');

	await page.getByLabel('Email').focus();
	await expect(page.getByLabel('Email')).toBeFocused();
	await page.keyboard.type('ada@example.com');
	await page.keyboard.press('Tab');
	await expect(page.getByLabel('Password')).toBeFocused();
	await page.keyboard.type('incorrect-password');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

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
				? json(route, [personalWorkspace])
				: json(route, { message: 'Unauthorized' }, 401);
		}
		if (pathname === '/api/favorites') {
			return authenticated ? json(route, []) : json(route, { message: 'Unauthorized' }, 401);
		}
		if (pathname === '/api/auth/sign-up/email') {
			expect(body).toEqual({
				name: 'Ada Lovelace',
				username: 'ada_lovelace',
				email: 'ada@example.com',
				password: 'correct-horse-battery-staple',
				callbackURL: '/'
			});
			return json(route, { user: { id: 'user-e2e' }, token: null });
		}
		if (pathname === '/api/auth/username-availability') {
			expect(new URL(request.url()).searchParams.get('username')).toBe('ada_lovelace');
			return json(route, {
				available: true,
				username: 'ada_lovelace',
				message: 'Username is available.'
			});
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
		const insights = emptyInsightsResponse(pathname, request.method());
		if (insights !== undefined) return json(route, insights);

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
	await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
	await page.getByLabel('Username').fill('Ada_Lovelace');
	await expect(page.getByLabel('Username')).toHaveValue('ada_lovelace');
	await expect(page.getByText('Username is available.')).toBeVisible();
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery-staple');
	await page.getByRole('button', { name: 'Create account', exact: true }).click();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await expect(
		page.getByText('Check your email to verify your account, then sign in.')
	).toBeVisible();
	await page.getByRole('link', { name: 'Sign in' }).click();
	await expect(page).toHaveURL('/sign-in');
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery-staple');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page).toHaveURL('/home');
	await expect(page.getByRole('link', { name: 'Open workspace' })).toBeVisible();
});

test('explains username availability and signup conflicts with keyboard and accessible feedback', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chromium');
	let availabilityRequests = 0;
	await page.route('**/api/auth/username-availability**', (route) => {
		availabilityRequests += 1;
		const username = new URL(route.request().url()).searchParams.get('username');
		return json(route, {
			available: username !== 'taken_name',
			username,
			message:
				username === 'taken_name' ? 'That username is already taken.' : 'Username is available.'
		});
	});
	await page.route('**/api/auth/sign-up/email', (route) =>
		json(route, { code: 'USERNAME_UNAVAILABLE', message: 'That username is already taken.' }, 409)
	);

	await page.goto('/sign-up');
	await page.getByLabel('Name', { exact: true }).focus();
	await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
	await page.keyboard.type('Ada Lovelace');
	await page.keyboard.press('Tab');
	await expect(page.getByLabel('Username')).toBeFocused();
	await page.keyboard.type('admin');
	await expect(page.getByText('That username is reserved.')).toBeVisible();
	await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
	expect(availabilityRequests).toBe(0);
	await page.getByLabel('Username').fill('taken_name');
	await expect(page.getByText('That username is already taken.')).toBeVisible();
	expect(availabilityRequests).toBe(1);
	await page.getByLabel('Username').fill('available_name');
	await expect(page.getByText('Username is available.')).toBeVisible();
	expect(availabilityRequests).toBe(2);
	await page.getByLabel('Email').fill('ada@example.com');
	await page.getByLabel('Password').fill('correct-horse-battery-staple');
	await page.getByLabel('Password').press('Enter');
	await expect(page.getByRole('alert')).toContainText('That username is already taken.');

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

test('loads, validates, and saves profile identity accessibly on desktop and mobile', async ({
	page
}) => {
	let sessionCalls = 0;
	let availabilityRequests = 0;
	let user = {
		id: 'user-e2e',
		name: 'Ada Byron Lovelace',
		username: 'ada_lovelace',
		email: 'ada@example.com',
		emailVerified: true,
		image: null
	};

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname, searchParams } = new URL(request.url());
		const method = request.method();

		if (pathname === '/api/auth/get-session' && method === 'GET') {
			sessionCalls += 1;
			await new Promise((resolve) => setTimeout(resolve, 250));
			return json(route, { session: { id: 'session-e2e' }, user });
		}
		if (pathname === '/api/auth/username-availability' && method === 'GET') {
			availabilityRequests += 1;
			return json(route, {
				available: true,
				username: searchParams.get('username'),
				message: 'Username is available.'
			});
		}
		if (pathname === '/api/auth/update-user' && method === 'POST') {
			const body = request.postDataJSON() as { name: string; username: string };
			expect(Object.keys(body).sort()).toEqual(['name', 'username']);
			if (body.username === 'server_taken') {
				return json(
					route,
					{ code: 'USERNAME_UNAVAILABLE', message: 'That username is already taken.' },
					409
				);
			}
			user = { ...user, ...body };
			return json(route, { status: true });
		}
		if (pathname === '/api/workspaces' && method === 'GET') return json(route, [personalWorkspace]);
		if (pathname === `/api/workspaces/${workspaceId}/accounts` && method === 'GET')
			return json(route, []);
		if (pathname === '/api/favorites' && method === 'GET') return json(route, []);

		return json(route, { message: `Unexpected mocked request: ${method} ${pathname}` }, 500);
	});

	await page.goto('/profile');
	await expect(page.getByText('Loading profile…')).toBeVisible();
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Byron Lovelace');
	await expect(page.getByLabel('Username')).toHaveValue('ada_lovelace');
	await expect(page.getByLabel('Email')).toHaveValue('ada@example.com');
	await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');
	await expect(page.getByRole('img', { name: 'Profile initials: AL' })).toBeVisible();
	const cardTitles = await page.locator('[data-slot="card-title"]').allTextContents();
	expect(cardTitles.indexOf('Public identity')).toBeLessThan(
		cardTitles.indexOf('Workspace recovery')
	);

	await page.getByLabel('Name', { exact: true }).focus();
	await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByLabel('Username')).toBeFocused();
	await page.getByLabel('Username').fill('admin');
	await expect(page.getByText('That username is reserved.')).toBeVisible();
	expect(availabilityRequests).toBe(0);
	await page.getByLabel('Username').fill('server_taken');
	await expect(page.getByText('Username is available.')).toBeVisible();
	await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await expect(page.getByRole('alert')).toContainText('That username is already taken.');
	await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');

	await page.getByLabel('Username').fill('ada_updated');
	await expect(page.getByText('Username is available.')).toBeVisible();
	await page.getByLabel('Username').press('Tab');
	await expect(page.getByLabel('Email')).toBeFocused();
	await page.getByLabel('Email').press('Tab');
	await expect(page.getByRole('button', { name: 'Save profile' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('status')).toContainText('Your profile was updated.');
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ada Lovelace');
	await expect(page.getByLabel('Username')).toHaveValue('ada_updated');
	expect(sessionCalls).toBeGreaterThanOrEqual(3);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
});

test('shows generic and stored profile-image fallbacks', async ({ page }, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop-chromium');
	let image: string | null = null;
	let name = 'Prince';
	await page.route('**/api/auth/get-session', (route) =>
		json(route, {
			session: { id: 'session-e2e' },
			user: {
				id: 'user-e2e',
				name,
				username: 'fallback_user',
				email: 'fallback@example.com',
				emailVerified: true,
				image
			}
		})
	);
	await page.route('**/api/workspaces', (route) => json(route, [personalWorkspace]));
	await page.route(`**/api/workspaces/${workspaceId}/accounts`, (route) => json(route, []));
	await page.route('**/api/favorites', (route) => json(route, []));

	await page.goto('/profile');
	await expect(page.getByRole('img', { name: 'Profile initials: P' })).toBeVisible();
	name = '';
	await page.reload();
	await expect(page.getByRole('img', { name: 'Generic profile image' })).toBeVisible();
	name = 'Profile Image User';
	image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
	await page.reload();
	await expect(page.getByRole('img', { name: "Profile Image User's profile" })).toBeVisible();
});

test('protects workspace routes and routes authenticated users from root', async ({ page }) => {
	let authenticated = false;
	await page.route('**/api/auth/get-session', (route) =>
		json(route, authenticated ? { session: { id: 'session-e2e' } } : null)
	);
	await page.route('**/api/workspaces', (route) => json(route, []));
	await page.route('**/api/favorites', (route) => json(route, []));
	await page.goto(`/workspaces/${workspaceId}`);
	await expect(page).toHaveURL('/sign-in');
	authenticated = true;
	await page.goto('/');
	await expect(page).toHaveURL('/home');
});

test('keeps global navigation available outside a workspace', async ({ page }) => {
	const personalAccount = {
		id: accountId,
		name: 'Everyday account',
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '120000',
		balanceMinor: '120000',
		negativeBalance: false,
		version: 1,
		archivedAt: null,
		canDelete: true,
		canArchive: false,
		canRestore: false
	};
	await page.route('**/api/auth/get-session', (route) =>
		json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } })
	);
	await page.route('**/api/workspaces', (route) => json(route, [personalWorkspace]));
	await page.route(`**/api/workspaces/${workspaceId}/accounts`, (route) =>
		json(route, [personalAccount])
	);
	await page.route('**/api/favorites', (route) => json(route, []));

	await page.goto('/home');
	await openSidebar(page);
	await expect(
		page.locator('[data-slot="sidebar-group-label"]', { hasText: /^Personal$/ })
	).toHaveCount(1);
	await expect(page.getByRole('link', { name: 'Personal', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /Everyday account/ })).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Add Personal · Accounts to favorites' })
	).toBeAttached();
	await expect(
		page.getByRole('button', { name: 'Add Personal · Everyday account to favorites' })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Collapse Personal accounts' }).click();
	await expect(page.getByRole('link', { name: /Everyday account/ })).toBeHidden();
	await expect(page.getByRole('link', { name: 'Create shared workspace' })).toBeVisible();
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(results.violations).toEqual([]);
	await clickSidebarLink(page, 'Settings');
	await expect(page).toHaveURL('/settings');
	await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
	await clickSidebarLink(page, 'Profile');
	await expect(page).toHaveURL('/profile');
	await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();
	await clickSidebarLink(page, 'Home');
	await expect(page).toHaveURL('/home');
	await openSidebar(page);
	await expect(page.getByRole('button', { name: 'Expand Personal accounts' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Everyday account/ })).toBeHidden();
});

test('logs out from the global navigation', async ({ page }) => {
	let authenticated = true;
	let signOutRequested = false;

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname } = new URL(request.url());
		const method = request.method();

		if (pathname === '/api/auth/get-session' && method === 'GET') {
			return json(
				route,
				authenticated ? { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } } : null
			);
		}
		if (pathname === '/api/auth/sign-out' && method === 'POST') {
			expect(request.postData()).toBeNull();
			expect(await request.headerValue('content-type')).toBeNull();
			authenticated = false;
			signOutRequested = true;
			return route.fulfill({ status: 204 });
		}
		if (pathname === '/api/workspaces' && method === 'GET') return json(route, [personalWorkspace]);
		if (pathname === '/api/favorites' && method === 'GET') return json(route, []);

		return json(route, { message: `Unexpected mocked request: ${method} ${pathname}` }, 500);
	});

	await page.goto('/home');
	await openSidebar(page);
	await page.getByRole('button', { name: 'Log out', exact: true }).click();
	await expect(page).toHaveURL('/sign-in');
	expect(signOutRequested).toBe(true);
});

test('pins workspace pages in global Favorites', async ({ page }) => {
	await mockLedger(page);
	await page.goto(`/workspaces/${workspaceId}`);
	await openSidebar(page);
	await page.getByRole('button', { name: 'Add Personal · Categories to favorites' }).click();

	const favorites = page.getByLabel('Favorites', { exact: true });
	await expect(favorites.getByRole('link', { name: 'Personal · Categories' })).toBeVisible();
	await clickSidebarLink(page, 'Personal · Categories');
	await expect(page).toHaveURL(`/workspaces/${workspaceId}/categories`);

	await clickSidebarLink(page, 'Home');
	await openSidebar(page);
	await expect(favorites.getByRole('link', { name: 'Personal · Categories' })).toBeVisible();
	await favorites
		.getByRole('button', { name: 'Remove Personal · Categories from favorites' })
		.click();
	await expect(favorites).toHaveCount(0);
});

test('keeps the shell recoverable for a stored route-like favorite path', async ({ page }) => {
	await mockLedger(page, [
		{
			id: 'favorite-route-id',
			path: '/workspaces/[workspaceId]',
			label: 'Old favorite'
		}
	]);
	await page.goto('/home');

	await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
	await openSidebar(page);
	const favorites = page.getByLabel('Favorites', { exact: true });
	await expect(favorites.getByRole('link', { name: 'Old favorite' })).toHaveAttribute(
		'href',
		'/workspaces/[workspaceId]'
	);
	await favorites.getByRole('button', { name: 'Remove Old favorite from favorites' }).click();
	await expect(favorites).toHaveCount(0);
});

test('creates and selects a household workspace', async ({ page }) => {
	const householdId = 'household-e2e';
	const household = {
		id: householdId,
		name: 'Lovelace household',
		type: 'household',
		reportingCurrency: 'EUR',
		version: 1,
		role: 'owner'
	};
	let created = false;
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/favorites' && method === 'GET') return json(route, []);
		if (path === '/api/workspaces' && method === 'GET')
			return json(route, created ? [personalWorkspace, household] : [personalWorkspace]);
		if (path === '/api/workspaces' && method === 'POST') {
			expect(request.postDataJSON()).toEqual({
				name: 'Lovelace household',
				reportingCurrency: 'EUR'
			});
			created = true;
			return json(route, household, 201);
		}
		if (path.endsWith('/accounts')) return json(route, []);
		if (path === `/api/workspaces/${householdId}/members`)
			return json(route, [
				{ userId: 'user-e2e', name: 'Ada', email: 'ada@example.com', role: 'owner' }
			]);
		if (path === `/api/workspaces/${householdId}/invitations`) return json(route, []);
		const insights = emptyInsightsResponse(path, method);
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto('/home');
	await page.getByRole('link', { name: 'New shared workspace' }).click();
	await page.getByLabel('Name', { exact: true }).fill('Lovelace household');
	await page.getByLabel('Reporting currency', { exact: true }).fill('eur');
	await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
	await expect(page).toHaveURL(`/workspaces/${householdId}/manage`);
	await expect(page.getByText('Household settings', { exact: true })).toBeVisible();
	await page.goto('/home');
	await expect(
		page.getByLabel('Shared', { exact: true }).getByText('Lovelace household', { exact: true })
	).toBeVisible();
});

test('returns home after leaving or deleting shared workspaces', async ({ page }) => {
	const householdId = 'household-leave-e2e';
	const ownedHouseholdId = 'household-delete-e2e';
	const household = {
		id: householdId,
		name: 'Shared household',
		type: 'household' as const,
		reportingCurrency: 'USD',
		version: 1,
		role: 'member' as const
	};
	const ownedHousehold = {
		...household,
		id: ownedHouseholdId,
		name: 'Owned household',
		role: 'owner' as const
	};
	let joined = true;
	let owned = true;
	let memberLoadsAfterLeave = 0;
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/favorites' && method === 'GET') return json(route, []);
		if (path === '/api/workspaces')
			return json(route, [
				personalWorkspace,
				...(joined ? [household] : []),
				...(owned ? [ownedHousehold] : [])
			]);
		if (path.endsWith('/accounts') || path.endsWith('/categories')) return json(route, []);
		if (
			path === `/api/workspaces/${householdId}/members` ||
			path === `/api/workspaces/${ownedHouseholdId}/members`
		) {
			if ((!joined && path.includes(householdId)) || (!owned && path.includes(ownedHouseholdId)))
				memberLoadsAfterLeave++;
			return json(route, [
				{
					userId: 'user-e2e',
					name: 'Ada',
					email: 'ada@example.com',
					role: path.includes(ownedHouseholdId) ? 'owner' : 'member'
				}
			]);
		}
		if (path === `/api/workspaces/${ownedHouseholdId}/invitations`) return json(route, []);
		if (path === `/api/workspaces/${householdId}/leave` && method === 'POST') {
			joined = false;
			return json(route, null);
		}
		if (path === `/api/workspaces/${ownedHouseholdId}/delete` && method === 'POST') {
			owned = false;
			return json(route, null);
		}
		const insights = emptyInsightsResponse(path, method);
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto(`/workspaces/${householdId}/manage`);
	await expect(page.getByText('Household settings', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Leave household' }).click();
	await expect(page).toHaveURL('/home');
	await expect(page.getByText('Shared household', { exact: true })).toHaveCount(0);

	await page.goto(`/workspaces/${ownedHouseholdId}/manage`);
	await page.getByLabel('Type “Owned household”').fill('Owned household');
	await page.getByLabel('Current password').fill('correct-horse-battery-staple');
	await page.getByRole('button', { name: 'Delete household' }).click();
	await expect(page).toHaveURL('/home');
	await expect(page.getByText('Owned household', { exact: true })).toHaveCount(0);
	expect(memberLoadsAfterLeave).toBe(0);
});

test('keeps workspace selection in the URL across browser navigation', async ({ page }) => {
	const secondWorkspaceId = 'workspace-second';
	const workspaces = [
		personalWorkspace,
		{
			...personalWorkspace,
			id: secondWorkspaceId,
			name: 'Second workspace',
			type: 'household' as const,
			role: 'member' as const
		}
	];
	const accountFor = (id: string, name: string): Account & Record<string, unknown> => ({
		id,
		name,
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '0',
		balanceMinor: '0',
		negativeBalance: false,
		version: 1,
		archivedAt: null,
		canDelete: true,
		canArchive: true,
		canRestore: false
	});
	const firstAccount = accountFor('account-first', 'First account');
	const secondAccount = accountFor('account-second', 'Second account');
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/favorites' && method === 'GET') return json(route, []);
		if (path === '/api/workspaces') return json(route, workspaces);
		if (path === `/api/workspaces/${secondWorkspaceId}/accounts`)
			return json(route, [secondAccount]);
		if (path === `/api/workspaces/${secondWorkspaceId}/categories`) return json(route, []);
		if (path === `/api/workspaces/${workspaceId}/accounts`) return json(route, [firstAccount]);
		if (path === `/api/workspaces/${workspaceId}/categories`) return json(route, []);
		if (path.includes('/accounts/') && method === 'GET') return json(route, []);
		const insights = emptyInsightsResponse(path, method);
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto(`/workspaces/${workspaceId}`);
	await openSidebar(page);
	await expect(
		page.locator('[data-slot="sidebar-group-label"]', { hasText: /^Personal$/ })
	).toHaveCount(1);
	await expect(page.getByRole('link', { name: 'Second workspace', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Expand Second workspace' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Second account/ })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Workspace' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /First account/ })).toBeVisible();
	await clickSidebarLink(page, 'Second workspace');
	await expect(page).toHaveURL(`/workspaces/${secondWorkspaceId}`);
	await openSidebar(page);
	await expect(
		page.getByRole('button', { name: 'Collapse Second workspace', exact: true })
	).toBeVisible();
	await expect(page.getByRole('link', { name: /Second account/ })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(`/workspaces/${workspaceId}`);
	await openSidebar(page);
	await expect(page.getByRole('link', { name: /First account/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Second account/ })).toHaveCount(0);
	const mobileSidebar = page.getByRole('dialog', { name: 'Sidebar' });
	if (await mobileSidebar.isVisible()) {
		await page.keyboard.press('Control+b');
		await expect(mobileSidebar).toBeHidden();
	}
	await page.getByRole('button', { name: 'Add transaction' }).click();
	await expect(page.getByLabel('Amount').filter({ visible: true })).toBeVisible();
	await page.goForward();
	await expect(page).toHaveURL(`/workspaces/${secondWorkspaceId}`);
	await expect(page.getByLabel('Amount').filter({ visible: true })).toHaveCount(0);
});

test('keeps account URLs authoritative through stale loads and deletion', async ({ page }) => {
	const firstAccountId = 'account-first';
	const secondAccountId = 'account-second';
	const accountFor = (id: string, name: string): Account & Record<string, unknown> => ({
		id,
		name,
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '0',
		balanceMinor: '0',
		negativeBalance: false,
		version: 1,
		archivedAt: null,
		canDelete: true,
		canArchive: true,
		canRestore: false
	});
	let accounts = [
		accountFor(firstAccountId, 'First account'),
		accountFor(secondAccountId, 'Second account')
	];
	let delaySecondAccount = false;
	let invalidLedgerRequests = 0;
	let accountListRequests = 0;
	let signalSecondRequest!: () => void;
	let releaseSecondRequest!: () => void;
	const secondRequestStarted = new Promise<void>((resolve) => {
		signalSecondRequest = resolve;
	});
	const secondRequestRelease = new Promise<void>((resolve) => {
		releaseSecondRequest = resolve;
	});

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		const method = request.method();
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/favorites' && method === 'GET') return json(route, []);
		if (path === '/api/workspaces') return json(route, [personalWorkspace]);
		if (path === `/api/workspaces/${workspaceId}/accounts` && method === 'GET') {
			accountListRequests++;
			return json(route, accounts);
		}
		if (path === `/api/workspaces/${workspaceId}/categories`) return json(route, []);
		if (path.includes('/account-missing/')) {
			invalidLedgerRequests++;
			return json(route, { message: 'Account missing.' }, 404);
		}
		if (
			path === `/api/workspaces/${workspaceId}/accounts/${secondAccountId}/transactions` &&
			delaySecondAccount
		) {
			signalSecondRequest();
			await secondRequestRelease;
			return json(route, { message: 'Obsolete account failure.' }, 500);
		}
		if (path.endsWith('/transactions') && method === 'GET') {
			const first = path.includes(`/${firstAccountId}/`);
			return json(route, [
				{
					id: first ? 'transaction-first' : 'transaction-second',
					kind: 'income',
					amountMinor: '100',
					date: '2026-08-01',
					description: first ? 'First account transaction' : 'Second account transaction',
					version: 1,
					trashedAt: null
				}
			]);
		}
		if (
			method === 'GET' &&
			['transfers', 'balance-checks', 'corrections'].some((entity) => path.endsWith(`/${entity}`))
		)
			return json(route, []);
		if (
			path === `/api/workspaces/${workspaceId}/accounts/${secondAccountId}/delete` &&
			method === 'POST'
		) {
			accounts = accounts.filter(({ id }) => id !== secondAccountId);
			return json(route, null);
		}
		const insights = emptyInsightsResponse(path, method);
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto(`/workspaces/${workspaceId}/accounts/${secondAccountId}/activity`);
	await expect(page.getByRole('heading', { name: 'Second account', level: 1 })).toBeVisible();
	expect(accountListRequests).toBe(1);
	await expect(
		page.getByText('Second account transaction', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	await clickSidebarLink(page, /First account/);
	await expect(
		page.getByText('First account transaction', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();

	delaySecondAccount = true;
	await clickSidebarLink(page, /Second account/);
	await secondRequestStarted;
	await clickSidebarLink(page, /First account/);
	releaseSecondRequest();
	await expect(page).toHaveURL(`/workspaces/${workspaceId}/accounts/${firstAccountId}/activity`);
	await expect(
		page.getByText('First account transaction', { exact: true }).filter({ visible: true }).first()
	).toBeVisible();
	await expect(page.getByText('Workspace unavailable', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Account activity unavailable', { exact: true })).toHaveCount(0);

	await page.goto(`/workspaces/${workspaceId}/accounts/account-missing/activity`);
	await expect(page).toHaveURL(`/workspaces/${workspaceId}/accounts`);
	expect(invalidLedgerRequests).toBe(0);

	delaySecondAccount = false;
	await page.goto(`/workspaces/${workspaceId}/accounts/${secondAccountId}/activity`);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Delete permanently' }).click();
	await expect(page).toHaveURL(`/workspaces/${workspaceId}/accounts`);
	await expect(page.getByText('Second account', { exact: true })).toHaveCount(0);
});

test('renders a private incoming cross-workspace transfer without management controls', async ({
	page
}) => {
	const householdId = 'household-transfer-e2e';
	const householdAccountId = 'household-account-e2e';
	const privateIdentity = 'Ada secret checking';
	const account = {
		id: householdAccountId,
		name: 'Shared current account',
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '0',
		balanceMinor: '2500',
		negativeBalance: false,
		version: 1,
		archivedAt: null,
		canDelete: false,
		canArchive: false,
		canRestore: false
	};
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		if (path === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (path === '/api/favorites' && request.method() === 'GET') return json(route, []);
		if (path === '/api/workspaces')
			return json(route, [
				personalWorkspace,
				{
					id: householdId,
					name: 'Shared home',
					type: 'household',
					reportingCurrency: 'USD',
					version: 1,
					role: 'member'
				}
			]);
		if (path === `/api/workspaces/${workspaceId}/accounts`) return json(route, []);
		if (path === `/api/workspaces/${householdId}/accounts`) return json(route, [account]);
		if (path === `/api/workspaces/${householdId}/members`) return json(route, []);
		if (path.endsWith('/transactions')) return json(route, []);
		if (path.endsWith('/transfers'))
			return json(route, [
				{
					id: 'private-transfer-e2e',
					amountMinor: '2500',
					date: '2026-08-04',
					description: 'Personal contribution',
					counterparty: { visibility: 'private', name: privateIdentity },
					localSide: 'to',
					canManage: false,
					detachedAt: null,
					version: 1,
					trashedAt: null
				}
			]);
		if (path.endsWith('/balance-checks') || path.endsWith('/corrections')) return json(route, []);
		const insights = emptyInsightsResponse(path, request.method());
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${request.method()} ${path}` }, 500);
	});

	await page.goto(`/workspaces/${householdId}`);
	await clickSidebarLink(page, /Shared current account/);
	const transfer = page
		.getByText('Incoming transfer', { exact: true })
		.locator('xpath=ancestor::*[@data-slot="card"][1]');
	await expect(transfer).toContainText('Private personal account');
	await expect(transfer).toContainText('+25,00 USD');
	await expect(transfer.getByRole('button', { name: /^(Edit|Trash|Restore)$/ })).toHaveCount(0);
	await expect(page.getByText(privateIdentity, { exact: false })).toHaveCount(0);
});

test('completes the personal account and manual ledger workflow', async ({ page }) => {
	test.setTimeout(60_000);
	await mockLedger(page);
	await page.goto(`/workspaces/${workspaceId}`);

	await expect(page.getByText('No accounts', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add account' }).click();
	const accountDialog = page.getByRole('dialog');
	await accountDialog.getByLabel('Name', { exact: true }).fill('Everyday account');
	await expect(accountDialog.getByLabel('Type', { exact: true })).toContainText('Current');
	await expect(accountDialog.getByLabel('Currency', { exact: true })).toContainText('USD');
	await accountDialog.getByLabel('Currency', { exact: true }).click();
	const currencyOptions = page.getByRole('listbox').getByRole('option');
	await expect(currencyOptions).toHaveCount(33);
	await expect(currencyOptions.filter({ hasText: 'USD — US dollar' })).toHaveCount(1);
	await page.keyboard.press('Escape');
	await accountDialog.getByLabel('Opening balance', { exact: true }).fill('100.00');
	await submitDialog(page);
	await openSidebar(page);
	const accountNavigation = page.getByRole('link', { name: /Everyday account/ });
	await expect(accountNavigation).toBeVisible();
	await expect(accountNavigation).toContainText('100,00 USD');
	await accountNavigation.click();
	await page.getByRole('button', { name: 'Account history' }).click();
	await expect(page.getByRole('dialog')).toContainText('user-e2e');
	await expect(page.getByRole('dialog')).toContainText('description: "Rent" → "Rent corrected"');
	await page.getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'Add transaction' }).click();
	await page.getByLabel('Amount', { exact: true }).fill('1.001');
	await submitDialog(page);
	await expect(page.getByText('Enter an amount with at most 2 decimal places.')).toBeVisible();
	await page.getByLabel('Amount', { exact: true }).fill('125.00');
	await page.getByRole('dialog').getByLabel('Description').fill('Rent');
	await submitDialog(page);
	await expect(page.getByText('Negative balance')).toBeVisible();
	await expect(page.getByText('-25,00 USD', { exact: true }).last()).toBeVisible();

	await page.getByRole('button', { name: 'Add transaction' }).click();
	await chooseSelect(page, 'Kind', 'Income');
	await page.getByLabel('Amount', { exact: true }).fill('25.00');
	await page.getByRole('dialog').getByLabel('Description').fill('Refund');
	await submitDialog(page);
	await expect(page.getByText('0,00 USD', { exact: true }).last()).toBeVisible();

	const rent = page
		.getByText('Rent', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await rent.getByRole('button', { name: 'Edit' }).click();
	await page.getByLabel('Amount', { exact: true }).fill('120.00');
	await page.getByRole('dialog').getByLabel('Description').fill('Rent corrected');
	await submitDialog(page);
	await expect(page.getByText('5,00 USD', { exact: true }).last()).toBeVisible();

	const refund = page
		.getByText('Refund', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await refund.getByRole('button', { name: 'Trash' }).click();
	await expect(page.getByText('Negative balance')).toBeVisible();
	await refund.getByRole('button', { name: 'Restore' }).click();
	await expect(page.getByText('5,00 USD', { exact: true }).last()).toBeVisible();

	await page.getByRole('button', { name: 'Edit account' }).click();
	await accountDialog.getByLabel('Name', { exact: true }).fill('Household account');
	await accountDialog.getByLabel('Type', { exact: true }).click();
	await page.getByRole('listbox').getByRole('option', { name: 'Savings', exact: true }).click();
	await submitDialog(page);
	await expect(page.getByText('Household account', { exact: true }).last()).toBeVisible();

	// Return the ledger to zero before exercising the account lifecycle rule.
	const correctedRent = page
		.getByText('Rent corrected', { exact: true })
		.locator('xpath=ancestor::*[self::tr or @data-slot="card"][1]');
	await correctedRent.getByRole('button', { name: 'Edit' }).click();
	await page.getByLabel('Amount', { exact: true }).fill('125.00');
	await submitDialog(page);
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Archive account' }).click();
	await openSidebar(page);
	await expect(page.getByRole('link', { name: /Household account/ })).toContainText('Archived');
	await clickSidebarLink(page, /Household account/);
	await expect(page.getByRole('button', { name: 'Add transaction' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Trash' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeHidden();
	await page.getByRole('button', { name: 'Edit account' }).click();
	await expect(accountDialog.getByLabel('Currency', { exact: true })).toBeDisabled();
	await expect(accountDialog.getByLabel('Opening balance', { exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('button', { name: 'Restore account' }).click();
	await expect(page.getByRole('button', { name: 'Add transaction' })).toBeVisible();
	await expect(page.getByText(/(?:Exchange-rate|Planning) action failed/)).toHaveCount(0);
});

test('categorizes spending and completes a reviewed CSV import batch', async ({ page }) => {
	const salaryId = 'category-salary';
	const groceriesId = 'category-groceries';
	const csv = [
		'date,kind,amount,description,category',
		'2026-08-01,expense,12.34,Market,Groceries',
		'2026-08-01,expense,12.34,Market duplicate,Groceries',
		'not-a-date,expense,nope,Broken row,Groceries',
		'2026-08-03,income,50.00,Side job,Freelance'
	].join('\n');
	const categories = [
		{
			id: salaryId,
			workspaceId,
			name: 'Salary',
			archivedAt: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: '2026-08-01T00:00:00.000Z'
		},
		{
			id: groceriesId,
			workspaceId,
			name: 'Groceries',
			archivedAt: null,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: '2026-08-01T00:00:00.000Z'
		}
	];
	const account = {
		id: accountId,
		name: 'Everyday account',
		type: 'current',
		currency: 'USD',
		openingBalanceMinor: '10000',
		balanceMinor: '10000',
		negativeBalance: false,
		version: 1,
		archivedAt: null,
		canDelete: false,
		canArchive: false,
		canRestore: false
	};
	const manualTransaction = {
		id: 'manual-groceries',
		kind: 'expense',
		amountMinor: '2500',
		date: '2026-08-02',
		description: 'Weekly shop',
		categoryId: groceriesId,
		categoryName: 'Groceries',
		version: 1,
		trashedAt: null
	};
	const importedTransactions = [
		{
			...manualTransaction,
			id: 'import-known',
			date: '2026-08-01',
			amountMinor: '1234',
			description: 'Market',
			importSourceRow: 2
		},
		{
			...manualTransaction,
			id: 'import-duplicate',
			date: '2026-08-01',
			amountMinor: '1234',
			description: 'Market duplicate',
			importSourceRow: 3
		},
		{
			...manualTransaction,
			id: 'import-unknown',
			date: '2026-08-03',
			kind: 'income',
			amountMinor: '5000',
			description: 'Side job',
			categoryId: null,
			categoryName: null,
			importSourceRow: 5
		}
	];
	const batch = {
		id: 'import-batch-e2e',
		workspaceId,
		accountId,
		filename: 'august.csv',
		actorUserId: 'user-e2e',
		createdAt: '2026-08-05T12:00:00.000Z',
		trashedAt: null
	};
	let manualCreated = false;
	let imported = false;
	let trashed = false;
	let ledgerReads = 0;

	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const { pathname } = new URL(request.url());
		const method = request.method();
		const body = request.postDataJSON?.() as Record<string, any>;
		if (pathname === '/api/auth/get-session')
			return json(route, { session: { id: 'session-e2e' }, user: { id: 'user-e2e' } });
		if (pathname === '/api/favorites' && method === 'GET') return json(route, []);
		if (pathname === '/api/workspaces') return json(route, [personalWorkspace]);
		if (pathname.endsWith('/categories') && method === 'GET') return json(route, categories);
		if (pathname.endsWith('/accounts') && method === 'GET') return json(route, [account]);
		if (pathname.endsWith('/summary') && method === 'GET')
			return json(route, {
				currencies: [
					{
						currency: 'USD',
						incomeMinor: '0',
						spendingMinor: '2500',
						uncategorizedMinor: '0',
						groups: [
							{
								kind: 'expense',
								categoryId: groceriesId,
								categoryName: 'Groceries',
								amountMinor: '2500',
								transactions: [
									{
										id: manualTransaction.id,
										accountId,
										date: manualTransaction.date,
										kind: 'expense',
										amountMinor: '2500',
										description: 'Weekly shop'
									}
								]
							}
						]
					}
				]
			});
		if (pathname.endsWith(`/accounts/${accountId}/transactions`) && method === 'GET') {
			ledgerReads++;
			return json(route, [
				...(manualCreated ? [manualTransaction] : []),
				...(imported
					? importedTransactions.map((item) => ({
							...item,
							trashedAt: trashed ? '2026-08-05T13:00:00.000Z' : null
						}))
					: [])
			]);
		}
		if (method === 'GET' && /(transfers|balance-checks|corrections)$/.test(pathname))
			return json(route, []);
		if (pathname.endsWith(`/accounts/${accountId}/transactions`) && method === 'POST') {
			expect(body).toMatchObject({
				kind: 'expense',
				amountMinor: '2500',
				description: 'Weekly shop',
				categoryId: groceriesId,
				idempotencyKey: key
			});
			manualCreated = true;
			return json(
				route,
				{ transaction: manualTransaction, balanceMinor: '7500', negativeBalance: false },
				201
			);
		}
		if (pathname.endsWith('/imports') && method === 'GET')
			return json(
				route,
				imported ? [{ ...batch, trashedAt: trashed ? '2026-08-05T13:00:00.000Z' : null }] : []
			);
		if (pathname.endsWith('/imports/preview') && method === 'POST') {
			expect(body).toEqual({ filename: 'august.csv', accountId, csv });
			return json(route, {
				rows: [
					{
						sourceRow: 2,
						date: '2026-08-01',
						kind: 'expense',
						amount: '12.34',
						amountMinor: '1234',
						description: 'Market',
						category: 'Groceries',
						categoryId: groceriesId,
						categoryStatus: 'existing',
						errors: [],
						duplicateReason: null,
						selected: true
					},
					{
						sourceRow: 3,
						date: '2026-08-01',
						kind: 'expense',
						amount: '12.34',
						amountMinor: '1234',
						description: 'Market duplicate',
						category: 'Groceries',
						categoryId: groceriesId,
						categoryStatus: 'existing',
						errors: [],
						duplicateReason: 'Same date and amount',
						selected: false
					},
					{
						sourceRow: 4,
						date: 'not-a-date',
						kind: 'expense',
						amount: 'nope',
						amountMinor: '',
						description: 'Broken row',
						category: 'Groceries',
						categoryId: groceriesId,
						categoryStatus: 'existing',
						errors: ['Invalid date', 'Invalid amount'],
						duplicateReason: null,
						selected: false
					},
					{
						sourceRow: 5,
						date: '2026-08-03',
						kind: 'income',
						amount: '50.00',
						amountMinor: '5000',
						description: 'Side job',
						category: 'Freelance',
						categoryId: null,
						categoryStatus: 'unknown',
						errors: [],
						duplicateReason: null,
						selected: true
					}
				]
			});
		}
		if (pathname.endsWith('/imports/confirm') && method === 'POST') {
			expect(body).toEqual({
				filename: 'august.csv',
				accountId,
				csv,
				idempotencyKey: expect.any(String),
				rows: [
					{
						sourceRow: 2,
						include: true,
						duplicateAcknowledged: false,
						categoryId: groceriesId
					},
					{
						sourceRow: 3,
						include: true,
						duplicateAcknowledged: true,
						categoryId: groceriesId
					},
					{
						sourceRow: 4,
						include: false,
						duplicateAcknowledged: false,
						categoryId: groceriesId
					},
					{ sourceRow: 5, include: true, duplicateAcknowledged: false }
				]
			});
			imported = true;
			return json(route, { ...batch, count: 3 }, 201);
		}
		if (pathname.endsWith(`/imports/${batch.id}`) && method === 'GET')
			return json(route, { ...batch, transactions: importedTransactions });
		if (pathname.endsWith(`/imports/${batch.id}/trash`) && method === 'POST') {
			expect(body).toEqual({ idempotencyKey: expect.any(String) });
			trashed = true;
			return json(route, { trashed: 3 });
		}
		return json(route, { message: `Unexpected mocked request: ${method} ${pathname}` }, 500);
	});

	await page.goto(`/workspaces/${workspaceId}`);
	await clickSidebarLink(page, /Everyday account/);
	await page.getByRole('button', { name: 'Add transaction' }).click();
	await page.getByLabel('Amount', { exact: true }).fill('25.00');
	await page.getByRole('dialog').getByLabel('Description').fill('Weekly shop');
	await chooseSelect(page, 'Category', 'Groceries');
	await submitDialog(page);
	await expect(
		page.getByText('Weekly shop', { exact: true }).filter({ visible: true })
	).toBeVisible();

	await clickSidebarLink(page, 'CSV imports');
	await page
		.getByLabel('CSV file')
		.setInputFiles({ name: 'august.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
	await page.getByRole('button', { name: 'Preview', exact: true }).click();
	for (const sourceRow of [2, 3, 4, 5]) {
		await expect(page.getByLabel(`Select row ${sourceRow}`)).toBeVisible();
	}
	await expect(page.getByText('Invalid: Invalid date; Invalid amount')).toBeVisible();
	await expect(page.getByText('Duplicate warning: Same date and amount')).toBeVisible();
	await expect(page.getByLabel('Select row 4')).toBeDisabled();
	await expect(page.getByLabel('Select row 3')).not.toBeChecked();
	await page.getByLabel('Select row 3').check();
	await expect(page.getByLabel('Category resolution row 2')).toContainText('Match Groceries');
	await expect(page.getByLabel('Category resolution row 5')).toContainText('Leave blank');
	await page.getByRole('button', { name: 'Confirm selected rows' }).click();
	await expect(page.getByText('Imported 3 transactions from august.csv.')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Import history' })).toBeVisible();
	await expect(page.getByText('august.csv', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Details' }).click();
	await expect(page.getByRole('heading', { name: 'august.csv details' })).toBeVisible();
	await expect(
		page.getByText('Row 2 · 2026-08-01 · expense · 1234 · Market', { exact: true })
	).toBeVisible();
	await expect(
		page.getByText('Row 3 · 2026-08-01 · expense · 1234 · Market duplicate', { exact: true })
	).toBeVisible();
	await expect(
		page.getByText('Row 5 · 2026-08-03 · income · 5000 · Side job', { exact: true })
	).toBeVisible();
	const readsBeforeTrash = ledgerReads;
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Trash batch' }).click();
	await expect(page.getByText('Trashed 3 imported transactions.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Trash batch' })).toHaveCount(0);
	expect(ledgerReads).toBe(readsBeforeTrash);
	await clickSidebarLink(page, /Everyday account/);
	await expect.poll(() => ledgerReads).toBeGreaterThan(readsBeforeTrash);
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
		if (path === '/api/favorites' && method === 'GET') return json(route, []);
		if (path === '/api/workspaces') return json(route, [personalWorkspace]);
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
			transfers.push({
				id: 'transfer-e2e',
				amountMinor: body.amountMinor,
				date: body.date,
				description: body.description,
				localSide: 'from',
				counterparty: { visibility: 'full', accountId: 'savings', name: 'Savings' },
				canManage: true,
				detachedAt: null,
				version: 1,
				trashedAt: null
			});
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
		const insights = emptyInsightsResponse(path, method);
		if (insights !== undefined) return json(route, insights);
		return json(route, { message: `Unexpected mocked request: ${method} ${path}` }, 500);
	});

	await page.goto(`/workspaces/${workspaceId}`);
	await clickSidebarLink(page, /Checking/);
	await page.getByRole('button', { name: 'New transfer' }).click();
	await expect(page.getByLabel('Source account')).toContainText('Checking (USD)');
	await chooseSelect(page, 'Destination account', 'Savings (USD)');
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
	await page.getByRole('link', { name: 'Reconciliation' }).click();
	await page.getByRole('button', { name: 'Add balance check' }).click();
	await page.getByLabel('Observed balance').fill('80.00');
	await submitDialog(page);
	await expect(page.getByText('+1,00 USD', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Create correction' }).click();
	await expect(page.getByRole('button', { name: 'Retry correction' })).toBeVisible();
	await page.getByRole('button', { name: 'Retry correction' }).click();
	await expect(page.getByRole('button', { name: 'Retry correction' })).toBeHidden();
	expect(correctionAttempts).toBe(2);
	expect(corrections).toHaveLength(1);
	await expect(page.getByText('80,00 USD', { exact: true }).last()).toBeVisible();
	await expect(page.getByText('Balance correction for check', { exact: false })).toBeVisible();
});
