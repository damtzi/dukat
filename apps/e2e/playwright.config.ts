import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'pnpm --filter @dukat/dashboard dev --host 127.0.0.1 --port 4173',
		cwd: '../..',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'phone-chromium', use: { ...devices['Pixel 7'] } }
	]
});
