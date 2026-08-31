import { expect, test } from '@playwright/test';

test('built dashboard starts under the production security policy', async ({ page }) => {
	const violations: string[] = [];
	await page.route('https://images.example.com/users/test.webp', (route) =>
		route.fulfill({
			contentType: 'image/webp',
			body: Buffer.from(
				'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==',
				'base64'
			)
		})
	);
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
	expect(response?.headers()['content-security-policy']).toContain(
		"img-src 'self' data: blob: https://images.example.com"
	);
	expect(response?.headers()['strict-transport-security']).toBeTruthy();
	const metaPolicy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(metaPolicy).toMatch(/script-src[^;]*'sha256-/);
	expect(metaPolicy).toContain('https://images.example.com');
	const imageLoaded = await page.evaluate(async () => {
		const image = new Image();
		image.src = 'https://images.example.com/users/test.webp';
		document.body.append(image);
		await image.decode();
		return image.naturalWidth > 0;
	});
	expect(imageLoaded).toBe(true);
	const apiResponse = await page.request.get('/api/health/live');
	expect(apiResponse.headers()['cache-control']).toBe('no-store');
	expect(violations).toEqual([]);
});
