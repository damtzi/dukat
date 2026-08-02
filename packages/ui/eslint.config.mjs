import { webConfig } from '@dukat/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
	...webConfig,
	{
		files: ['**/*.svelte'],
		languageOptions: {
			globals: {
				FileList: 'readonly',
				HTMLDivElement: 'readonly',
				HTMLElement: 'readonly',
				HTMLParagraphElement: 'readonly',
				HTMLTableRowElement: 'readonly',
				HTMLTableSectionElement: 'readonly'
			}
		}
	}
];
