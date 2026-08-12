import { expect, test } from '@playwright/test';

test('built dashboard starts under the production security policy', async ({ page }) => {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
			violations.push(message.text());
		}
	});
	await page.addInitScript(() => {
		window.addEventListener('securitypolicyviolation', (event) => {
			console.error(`Content Security Policy violation: ${event.violatedDirective}`);
		});
	});

	const response = await page.goto('/sign-in');
	await expect(page.getByText('Sign in to Dukat', { exact: true })).toBeVisible();
	expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
	expect(response?.headers()['strict-transport-security']).toBeTruthy();
	const metaPolicy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(metaPolicy).toMatch(/script-src[^;]*'sha256-/);
	const apiResponse = await page.request.get('/api/health/live');
	expect(apiResponse.headers()['cache-control']).toBe('no-store');
	expect(violations).toEqual([]);
});
