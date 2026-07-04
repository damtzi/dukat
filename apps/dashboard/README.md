# Dashboard app

This is a template SvelteKit app intended as a placeholder for a product surface or dashboard.

## Template status

The app currently demonstrates:

- SvelteKit routing.
- Shared Tailwind/global styles from `@repo/ui`.
- A shared shadcn-svelte Button component.

## Customize for your project

- Rename the app package if `@repo/dashboard` is not meaningful for your product.
- Replace the placeholder page with real product workflows.
- Add authentication, authorization, data loading, and deployment configuration as needed.

## Development

From the repository root:

```sh
pnpm --filter @repo/dashboard dev
pnpm --filter @repo/dashboard build
pnpm --filter @repo/dashboard check-types
pnpm --filter @repo/dashboard lint
```
