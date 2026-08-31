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

The default port is `9999`. Build the dashboard before starting the server so `apps/dashboard/build` exists. Package scripts run from `apps/server`, so the development default for `DASHBOARD_DIRECTORY` is `../dashboard/build`. Set it to an absolute path in production. Development and tests use local profile-image storage at `PROFILE_IMAGE_DIRECTORY` (`./data/profile-images` by default).

Production requires a separate public S3-compatible profile-image bucket. Configure the five
`PROFILE_IMAGE_S3_*` values and `PROFILE_IMAGE_PUBLIC_BASE_URL` shown in `.env.example`. Use the same
public origin, without a path, when building the dashboard. The server fails startup if production
storage configuration is missing or malformed, or if the built dashboard has a different image
origin in its CSP. Startup does not contact the bucket; connectivity errors affect profile-image
operations without taking down the rest of the app. For Cloudflare R2, use the account S3 endpoint,
region `auto`, a bucket-scoped Object Read & Write token, and a production custom domain as the public
origin. Do not use the encrypted database-backup bucket or its credentials.
