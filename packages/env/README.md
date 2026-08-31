# @dukat/env

Type-safe environment variables for this template monorepo.

The Node exports load `.env` files by walking upward from the current working directory, so commands can run from the repo root or from nested packages.

## Exports

- `@dukat/env/auth` — Better Auth and Resend configuration (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`).
- `@dukat/env/db` — Turso database configuration (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
- `@dukat/env/server` — server runtime configuration.

Production server configuration requires a dedicated public S3-compatible bucket for profile
images. Set `PROFILE_IMAGE_S3_ENDPOINT`, `PROFILE_IMAGE_S3_REGION`,
`PROFILE_IMAGE_S3_ACCESS_KEY_ID`, `PROFILE_IMAGE_S3_SECRET_ACCESS_KEY`,
`PROFILE_IMAGE_S3_BUCKET`, and `PROFILE_IMAGE_PUBLIC_BASE_URL`. Supply the public origin when
building the dashboard so its CSP permits that image origin. Keep the credentials server-only.

## Local development

Create a root `.env` file with the values needed by the packages you run:

```env
TURSO_DATABASE_URL=file:/absolute/path/to/dukat.db
TURSO_AUTH_TOKEN=
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:9999
CORS_ORIGIN=http://localhost:3001
RESEND_API_KEY=re_your-api-key
AUTH_EMAIL_FROM="Dukat <auth@example.com>"
LOG_LEVEL=info
```

For a hosted database, use its `libsql://` URL and provide `TURSO_AUTH_TOKEN`.

Keep secrets in server-only exports. Client-safe SvelteKit variables should use SvelteKit's `$env/static/public` or `$env/dynamic/public` conventions.
