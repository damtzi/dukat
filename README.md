# Dukat

This repository contains the Dukat TypeScript applications and shared packages.

## What is included

### Apps

- `apps/website` — Astro public website with Tailwind CSS and optional Svelte islands.
- `apps/dashboard` — client-side SvelteKit dashboard served by the Node application.
- `apps/admin` — SvelteKit app placeholder for internal tooling.
- `apps/server` — same-origin Node/Hono runtime for the dashboard and `/api/*`.

### Packages

- `packages/api` — Hono API definition with `@hono/zod-openapi` and a Scalar API reference.
- `packages/api-client` — typed client for `@dukat/api`, sharing types end to end.
- `packages/core` — shared example domain schemas and types.
- `packages/auth` — Better Auth and provider-neutral transactional email setup.
- `packages/db` — SQLite Drizzle schema, migrations, workspace repositories, and recovery commands.
- `packages/env` — type-safe environment variables via `@t3-oss/env-core`.
- `packages/ui` — shared shadcn-svelte UI components and Tailwind theme styles.
- `packages/utils` — shared utilities.
- `packages/eslint-config` and `packages/typescript-config` — shared tooling config.

## Development

Install dependencies from the repository root:

```sh
pnpm install
```

Run all dev tasks:

```sh
pnpm dev
```

Run a specific app/package:

```sh
pnpm --filter @dukat/website dev
pnpm --filter @dukat/dashboard dev
pnpm --filter @dukat/admin dev
pnpm --filter @dukat/server dev
```

Common root commands:

```sh
pnpm build
pnpm lint
pnpm check-types
pnpm test
pnpm format
```

### Local database

Copy `.env.example` to `.env`. Local development uses a file-backed libSQL database:

```env
TURSO_DATABASE_URL=file:/absolute/path/to/dukat.db
TURSO_AUTH_TOKEN=
```

Use a `libsql://` URL and token only for hosted Turso environments. The browser never receives either value.

Database schema commands run through the `@dukat/db` package:

```sh
pnpm --filter @dukat/db db:push
pnpm --filter @dukat/db db:generate
pnpm --filter @dukat/db db:migrate
pnpm --filter @dukat/db db:studio
```

Seed the local database with a verified demo user and sample finances:

```sh
pnpm db:seed
```

Sign in with `demo@dukat.local` and password `dukat-demo`. The command applies migrations and
replaces this demo user's data each time. It refuses hosted database URLs.

Production releases use `db:migrate:release`; backup and restore procedures are documented in [`docs/operations/recovery.md`](docs/operations/recovery.md).
