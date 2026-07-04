# @repo/env

Type-safe environment variables for this template monorepo.

The Node exports load `.env` files by walking upward from the current working directory, so commands can run from the repo root or from nested packages.

## Exports

- `@repo/env/auth` — Better Auth configuration (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`).
- `@repo/env/db` — database configuration (`DATABASE_URL`).
- `@repo/env/server` — server runtime configuration.

## Local development

Create a root `.env` file with the values needed by the packages you run:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

Keep secrets in server-only exports. Client-safe SvelteKit variables should use SvelteKit's `$env/static/public` or `$env/dynamic/public` conventions.
