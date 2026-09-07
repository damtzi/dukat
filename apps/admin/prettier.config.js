//  @ts-check

/** @type {import('prettier').Config} */
const config = {
  plugins: ['prettier-plugin-svelte'],
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  overrides: [{ files: '**/*.svelte', options: { parser: 'svelte' } }],
}

export default config
