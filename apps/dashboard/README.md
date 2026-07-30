# Dashboard app

This is Dukat's client-side SvelteKit dashboard. It builds static assets with an SPA fallback for the same-origin Node/Hono runtime.

## Development

From the repository root:

```sh
pnpm --filter @dukat/dashboard dev
pnpm --filter @dukat/dashboard build
pnpm --filter @dukat/dashboard check-types
pnpm --filter @dukat/dashboard lint
```
