import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

// Repo-wide rule preferences, shared by every config (incl. the web apps).
export const sharedRules = {
	'@typescript-eslint/no-non-null-assertion': 'off',
	'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
	'@typescript-eslint/no-explicit-any': 'warn',
	'no-console': 'warn',
	'prefer-const': 'error',
	'no-var': 'error'
};

export const baseConfig = defineConfig([
	{
		ignores: [
			'**/dist/**',
			'**/build/**',
			'**/.svelte-kit/**',
			'**/.output/**',
			'**/.nitro/**',
			'**/.next/**'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	prettierConfig,
	{
		files: ['**/*.{js,mjs,ts}'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				console: 'readonly',
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
				window: 'readonly',
				document: 'readonly',
				navigator: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly'
			}
		},
		rules: sharedRules
	},
	{
		files: ['**/*.cjs'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly'
			}
		},
		rules: {
			'@typescript-eslint/no-require-imports': 'off'
		}
	}
]);
