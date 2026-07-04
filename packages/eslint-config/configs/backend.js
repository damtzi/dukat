import { defineConfig } from 'eslint/config';
import { baseConfig } from './base.js';

export const backendConfig = defineConfig([
	...baseConfig,
	{
		files: ['**/*.{js,ts}'],
		languageOptions: {
			globals: {
				// Node.js specific globals
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				// Fetch API globals
				fetch: 'readonly',
				Response: 'readonly',
				Request: 'readonly',
				Headers: 'readonly'
			}
		},
		rules: {
			// Backend specific rule adjustments
			'no-console': 'off', // Console logs are often needed in backend
			'@typescript-eslint/no-explicit-any': 'warn' // Allow any with warning for external API types
		}
	}
]);
