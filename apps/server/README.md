# Server app

This is the production-shaped Node/Hono entrypoint. It serves the static client-side dashboard and owns `/api/*`, including Better Auth. API routes take precedence over the SPA fallback.

## Development

From the repository root:

```sh
pnpm --filter @dukat/server dev
pnpm --filter @dukat/server build
pnpm --filter @dukat/server lint
pnpm --filter @dukat/server test
```

The default port is `9999`. Build the dashboard before starting the server so `apps/dashboard/build` exists. Package scripts run from `apps/server`, so the development default for `DASHBOARD_DIRECTORY` is `../dashboard/build`. Set it to an absolute path in production. Profile images use local storage at `PROFILE_IMAGE_DIRECTORY` (`./data/profile-images` by default).
