# @dukat/env

Type-safe environment variables for this template monorepo.

The Node exports load `.env` files by walking upward from the current working directory, so commands can run from the repo root or from nested packages.

## Exports

- `@dukat/env/auth` — Better Auth configuration (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`).
- `@dukat/env/db` — Turso database configuration (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`).
- `@dukat/env/server` — server runtime configuration.

## Local development

Create a root `.env` file with the values needed by the packages you run:

```env
TURSO_DATABASE_URL=libsql://your-database-name-your-organization.turso.io
TURSO_AUTH_TOKEN=your-database-auth-token
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

For a local database, use an absolute file URL such as `file:/absolute/path/to/dukat.db` and omit `TURSO_AUTH_TOKEN`.

Keep secrets in server-only exports. Client-safe SvelteKit variables should use SvelteKit's `$env/static/public` or `$env/dynamic/public` conventions.
