# Dukat

This repository is a pnpm/Turborepo template for building TypeScript apps with SvelteKit, Astro, Hono, Better Auth, Drizzle, Tailwind CSS, and shadcn-svelte.

## What is included

### Apps

- `apps/website` — Astro public website with Tailwind CSS and optional Svelte islands.
- `apps/dashboard` — SvelteKit app placeholder for a product surface or dashboard.
- `apps/admin` — SvelteKit app placeholder for internal tooling.
- `apps/server` — Hono server that hosts the `@dukat/api` app via `@hono/node-server`.

### Packages

- `packages/api` — Hono API definition with `@hono/zod-openapi` and a Scalar API reference.
- `packages/api-client` — typed client for `@dukat/api`, sharing types end to end.
- `packages/core` — shared example domain schemas and types.
- `packages/auth` — Better Auth setup.
- `packages/db` — Drizzle ORM schema and Postgres access, with local Supabase for development.
- `packages/env` — type-safe environment variables via `@t3-oss/env-core`.
- `packages/ui` — shared shadcn-svelte UI components and Tailwind theme styles.
- `packages/utils` — shared utilities.
- `packages/eslint-config` and `packages/typescript-config` — shared tooling config.

## Template notes

- Workspace packages use the `@dukat/*` scope. Rename it if your product needs a different package namespace.
- Replace the placeholder pages in `apps/website`, `apps/dashboard`, and `apps/admin` with your product UI.
- Replace the example schemas in `packages/core` with your domain model.
- Update `CONTEXT.md` as your project-specific product and architecture context evolves.

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
pnpm format
```

### Local database

Supabase local development lives in `packages/db/supabase`. Install the Supabase CLI first, then start it from the repository root with:

```sh
pnpm db:start
```

The default local database URL is:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

Useful database commands:

```sh
pnpm db:status
pnpm db:reset
pnpm db:stop
pnpm --filter @dukat/db db:generate
pnpm --filter @dukat/db db:migrate
pnpm --filter @dukat/db db:studio
```
