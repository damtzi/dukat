# Dashboard app

This is a template SvelteKit app intended as a placeholder for a product surface or dashboard.

## Template status

The app currently demonstrates:

- SvelteKit routing.
- Shared Tailwind/global styles from `@dukat/ui`.
- A shared shadcn-svelte Button component.

## Customize for your project

- Rename the app package if `@dukat/dashboard` is not meaningful for your product.
- Replace the placeholder page with real product workflows.
- Add authentication, authorization, data loading, and deployment configuration as needed.

## Development

From the repository root:

```sh
pnpm --filter @dukat/dashboard dev
pnpm --filter @dukat/dashboard build
pnpm --filter @dukat/dashboard check-types
pnpm --filter @dukat/dashboard lint
```
