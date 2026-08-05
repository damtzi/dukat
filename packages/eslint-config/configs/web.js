import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

import { baseConfig, sharedRules } from './base.js';

// Shared lint config for SvelteKit apps and shared Svelte UI packages.
export const webConfig = defineConfig([
	...baseConfig,
	...svelte.configs['flat/recommended'],
	...svelte.configs['flat/prettier'],
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				RequestInit: 'readonly'
			},
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			// Svelte rune props are intentionally destructured with `let` so updates stay reactive.
			'prefer-const': 'off',
			// Shared UI primitives accept raw href values and are not route-aware.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		rules: {
			...sharedRules,
			// Svelte rune props are intentionally destructured with `let` so updates stay reactive.
			'prefer-const': 'off',
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/no-at-html-tags': 'error'
		}
	},
	{
		ignores: [
			'eslint.config.js',
			'eslint.config.mjs',
			'prettier.config.js',
			'dist',
			'.svelte-kit',
			'.vercel',
			'build'
		]
	}
]);
