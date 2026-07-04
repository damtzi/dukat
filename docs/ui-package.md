# `@repo/ui`

`@repo/ui` is the shared shadcn-svelte UI package for the SvelteKit apps in this monorepo.

## Public exports

- `@repo/ui` — root Svelte/TypeScript exports.
- `@repo/ui/components/ui/button` — shadcn-svelte button component entrypoint.
- `@repo/ui/styles/globals.css` — Tailwind v4 entrypoint, animation utilities, theme tokens, and base styles.
- `@repo/ui/styles/theme.css` — shared design tokens only.
- `@repo/ui/lib/utils` — shadcn-svelte utility helpers such as `cn` and element-ref types.

## shadcn-svelte setup

The shared package has its own `packages/ui/components.json` so the shadcn-svelte CLI can add components to `packages/ui/src/components/ui`.

From the UI package directory:

```sh
pnpm dlx shadcn-svelte@latest add button
```

For new components, keep generated component folders under `packages/ui/src/components/ui` and export stable public entrypoints from `packages/ui/src/index.ts` when they should be available from `@repo/ui`.

## Usage in SvelteKit apps

Import the shared CSS once from the app layout CSS file:

```css
@import '@repo/ui/styles/globals.css';
```

Use shared components from the package root or specific component entrypoints:

```svelte
<script lang="ts">
	import { Button } from '@repo/ui';
	// or: import { Button } from '@repo/ui/components/ui/button';
</script>

<Button>Save</Button>
```
