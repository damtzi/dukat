import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.FULL_STACK_BASE_URL;
const outputDir = process.env.FULL_STACK_OUTPUT_DIR;

if (!baseURL || !outputDir) {
	throw new Error('Run full-stack tests with pnpm test:e2e:full-stack.');
}

export default defineConfig({
	testDir: './tests',
	testMatch: 'full-stack.spec.ts',
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? 'github' : 'list',
	outputDir,
	use: {
		baseURL,
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		video: 'retain-on-failure'
	},
	projects: [
		{ name: 'full-stack-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'full-stack-chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
		{ name: 'full-stack-firefox', use: { ...devices['Desktop Firefox'] } },
		{ name: 'full-stack-webkit', use: { ...devices['Desktop Safari'] } },
		{ name: 'full-stack-edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
		{ name: 'full-stack-phone', use: { ...devices['Pixel 7'] } }
	]
});
