# Dukat

Dukat is a personal and household finance application. The MVP runs as one same-origin Node service: Hono serves `/api/*` and the client-side SvelteKit dashboard, while Drizzle connects only from the server to local libSQL or Turso.

## Development

Requires Node 24 and pnpm 10.

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm build
pnpm --filter @dukat/server dev
```

Local development uses `DATABASE_URL=file:../../data/dukat.db` (package scripts run from their workspace directories). The browser never receives a Turso token. Build `apps/dashboard` before starting the production-shaped server so its static output is available from the same origin.

## Commands

```sh
pnpm test          # isolated migration, auth, authorization, and recovery tests
pnpm check-types
pnpm lint
pnpm build
pnpm db:generate   # generate a reviewed, checked-in migration
pnpm db:migrate    # apply checked-in migrations
pnpm db:backup     # write an encrypted logical export
pnpm db:restore    # restore only into RESTORE_DATABASE_URL
pnpm db:check      # SQLite and workspace integrity checks
```

Production uses a `libsql://` `DATABASE_URL` and `DATABASE_AUTH_TOKEN`. Authentication email is sent through the provider-neutral adapter in `packages/auth`, backed by Resend in `apps/server`.

See [`docs/operations/database-recovery.md`](docs/operations/database-recovery.md) for backup and restore procedures.
