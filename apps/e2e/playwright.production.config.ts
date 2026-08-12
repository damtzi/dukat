import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: 'production-smoke.spec.ts',
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4174',
		trace: 'retain-on-failure'
	},
	webServer: {
		command:
			'pnpm --filter @dukat/dashboard build && pnpm --filter @dukat/e2e exec tsx tests/production-server.ts',
		cwd: '../..',
		url: 'http://127.0.0.1:4174/api/health/live',
		reuseExistingServer: false
	},
	projects: [
		{
			name: 'production-chrome',
			use: {
				...devices['Desktop Chrome'],
				...(process.env.CI ? { channel: 'chrome' } : {})
			}
		}
	]
});
