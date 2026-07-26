# Turso architecture validation for the Dukat MVP

## Verdict

The proposed stack can safely support the MVP with one shared Turso database, provided Dukat treats workspace authorization as an application invariant, stores money without floating point, uses transactions for multi-row financial changes, and establishes migration and recovery procedures before launch.

The repository uses Drizzle's native libSQL client and SQLite schema definitions, with Better Auth configured through its SQLite Drizzle adapter.

## Chosen application shape

### Runtime

Use one stateless Node application in one EU region for the MVP:

- `apps/dashboard` builds as a client-side SvelteKit application.
- `apps/server` runs Hono, serves the built dashboard, and owns `/api/*` including `/api/auth/*`.
- `apps/website` remains a separately deployable public Astro site.
- `apps/admin` is outside the MVP unless an operational need appears.
- Only the Hono server can access Turso. Browser code never receives a database token.

A single app origin avoids cross-site authentication cookies and unnecessary CORS. Better Auth documents mounting its handler directly on Hono and loading the session in Hono middleware.[^2] Use secure, HTTP-only, `SameSite=Lax` cookies in production rather than the template's unconditional `SameSite=None` setting. The latter is only needed for genuinely cross-site cookies, which Better Auth recommends avoiding when possible.[^2]

Deploy the server as a portable Node container behind TLS. Start with one application instance near the Turso primary. The process is stateless, so another instance can be added later after concurrent-write tests pass.

### Code boundaries

- `packages/core`: money, dates, recurrence, forecast calculations, authorization-independent domain rules, and Effect-based use cases.
- `packages/db`: SQLite Drizzle schema, repositories, transactions, and migrations.
- `packages/auth`: Better Auth configuration and session-to-user translation.
- `packages/api`: Hono routes, request validation, authorization context, and mapping typed use-case errors to HTTP responses.
- `packages/api-client`: generated or inferred browser client contracts.

Use Effect for application commands, dependency injection, typed expected failures, retries, and observability. Keep Hono, Better Auth, Drizzle, and Svelte APIs at adapters rather than wrapping every library call in domain abstractions.

## Better Auth and Turso

This integration is supported:

- Better Auth's Drizzle adapter accepts `provider: 'sqlite'` and a supplied Drizzle schema.[^1]
- Drizzle supports Turso through `drizzle-orm/libsql` and `@libsql/client`, with remote URL/token and local `file:` connections.[^4]
- Better Auth documents a Hono handler and session middleware.[^2]

Generate the current Better Auth SQLite schema with its CLI, check it into the Drizzle schema, then generate a normal reviewed migration. Do not let Better Auth mutate production schema independently of the application's migration process.[^1]

Email/password sign-in requires verified email ownership before a user can accept a household invitation. Use Resend initially for password reset, verification, and invitation emails behind a provider-neutral transactional email adapter. Never reveal whether an email has an account.

## Authorization boundary

Turso/SQLite does not provide the row-level security used by some Postgres systems. Dukat must therefore enforce workspace access in every application operation.

- Every workspace-owned table carries a non-null `workspace_id`.
- A request derives its user only from the verified Better Auth session.
- API clients never supply an authoritative user ID.
- A workspace authorization service checks personal ownership or household membership before a repository runs.
- Repositories require an authorization context containing both user and workspace; do not expose unrestricted workspace-owned queries to route handlers.
- Mutations check role and membership inside the same transaction as the write when the operation depends on current membership.
- List and lookup queries include `workspace_id` in their predicates. A globally unique record ID is not sufficient authorization.
- Database foreign keys and uniqueness constraints back application rules where SQLite can express them.
- Cross-workspace transfers expose only the side whose workspace the viewer can access. The linked account identity is returned only when the viewer can access that account's workspace.

Maintain an authorization test matrix covering personal owners, household members, household owners, removed members, unrelated users, and users who can access only one side of a transfer.

## Money, rates, and time

### Money

Store transaction and balance amounts as signed 64-bit integer minor units plus an ISO 4217 currency code. Validate each currency's supported decimal precision at the boundary. SQLite `INTEGER` stores exact signed integers up to eight bytes, while SQLite `REAL` is binary floating point and is not suitable for exact money.[^9]

At the domain boundary, represent money as `{ minorUnits: bigint, currency }`. Do not convert through JavaScript `number`. Define and test the libSQL driver's integer mode before implementation; reject values outside both SQLite's signed 64-bit range and Dukat's chosen product limit.

Store NBP and manual exchange rates as decimal text with fixed maximum precision, parse them into an exact decimal/rational domain type, and round only the final displayed reporting amount using the reporting currency's precision. Original amounts remain untouched.

### Dates and timestamps

- Financial dates are ISO `YYYY-MM-DD` text and are interpreted as calendar dates, not UTC instants.
- Audit and lifecycle timestamps are UTC instants.
- Recurrence calculations use calendar arithmetic and the rules decided in issue #6.
- The UI formats values with the user's locale; storage never uses locale-formatted numbers or dates.

## Transactions and concurrent writes

Turso supports explicit atomic transactions: all statements commit or all roll back.[^6] Use one short write transaction for:

- both sides of a transfer;
- a cross-workspace transfer and its redacted link;
- a balance check plus an optional correction;
- a confirmed CSV import batch;
- matching or unmatching a planned and completed transaction;
- membership/ownership changes whose safeguards depend on current counts;
- trash, restore, and permanent-deletion operations.

Do not store a mutable account-balance total in the MVP. Calculate it from opening balance and active ledger entries, with indexes on account/date/status. This avoids a hot balance row and prevents drift. Revisit snapshots only after measuring real query performance.

The default Turso configuration allows one writer at a time; concurrent-write modes can conflict and require retries.[^5] The MVP should:

- keep write transactions short and avoid network calls inside them;
- use optimistic `version` columns on user-edited financial records and return a clear conflict instead of overwriting another edit;
- give retriable commands an idempotency key;
- retry database busy/conflict failures with bounded jitter only when the command is idempotent;
- test simultaneous household edits, transfer creation, matching, and imports before launch.

Do not enable experimental concurrent-write behavior initially. One application instance and ordinary transactions are adequate for expected MVP load and easier to reason about.

## Migrations

Drizzle supports the Turso dialect and checked-in generated migrations through `drizzle-kit generate` and `drizzle-kit migrate`.[^4]

- Keep schema definitions on `sqliteTable` and Drizzle Kit's dialect set to `turso`.
- Use local `file:` libSQL databases in development and isolated temporary databases in tests.
- Generate SQL migrations, review them, and commit both SQL and snapshots.
- `db:push` is development-only. Production accepts only checked-in migrations.
- A release job, not every app instance, applies migrations once before compatible application code starts.
- Take a recoverable snapshot before production migration.
- Prefer expand/migrate/contract changes. Destructive changes require a tested restore path and a separate release after old code has been removed.
- Run the full migration chain against an empty database and against a copy of production-shaped data in CI.
- Use a normal migration table; Turso Cloud documents `PRAGMA user_version` as read-only.[^7]

## Backups and recovery

Turso supports point-in-time recovery by creating a new database at the selected time. Recovery requires changing the application connection string and creating a new token.[^8]

Before launch:

- Choose a Turso plan whose point-in-time recovery window meets the product's needs.
- Keep a daily encrypted logical export in separate object storage for 30 days so recovery does not depend on one provider or account.
- Monitor backup completion and age.
- Document how to stop writes, restore to a new database, create a token, run integrity checks, switch the application secret, and reopen traffic.
- Perform a restore drill before launch and at least quarterly.
- Target an MVP recovery point of at most 24 hours from logical backup, with Turso PITR providing a smaller loss window when available; target recovery within four hours.

A restore must verify foreign keys, workspace membership, transfer pairs, import-batch counts, and representative account-balance recalculations before traffic resumes.

## Deployment and operations

Required production components:

1. One Node/Hono application service in an EU region, serving API and dashboard assets.
2. One Turso production database and separate staging database.
3. Transactional email credentials.
4. S3-compatible encrypted backup storage.
5. A daily scheduler for exchange rates, permanent deletion, and backup export.
6. Central structured logs, error reporting, uptime checks, and alerts for failed migrations, stale exchange rates, failed backups, and repeated database conflicts.

Keep production database and email credentials only in the server secret store. Use separate tokens per environment, rotate them after staff or infrastructure changes, and redact tokens, cookies, CSV contents, descriptions, and amounts from logs.

## Validation gates

The architecture is ready to implement after these automated checks exist:

- Better Auth signup, verification, sign-in, sign-out, password reset, and session expiry against local libSQL.
- Household invitation acceptance only by the verified invited email.
- Authorization matrix tests for every workspace-owned API family.
- Atomic rollback tests for transfers, CSV batches, and matching.
- Concurrent edit tests proving stale versions do not overwrite newer data.
- Exact-money property tests across all supported currencies and limits.
- Full migration-chain and backup-restore smoke tests.
- A load test with realistic household writes and 12-month forecast reads.

## Sources

[^1]: Better Auth, [Drizzle ORM Adapter](https://www.better-auth.com/docs/adapters/drizzle). Documents SQLite support, supplied schemas, and CLI schema generation.

[^2]: Better Auth, [Hono Integration](https://www.better-auth.com/docs/integrations/hono). Documents handler mounting, session middleware, CORS, and cookie guidance.

[^3]: Better Auth, [SvelteKit Integration](https://www.better-auth.com/docs/integrations/svelte-kit). Confirms Svelte client support and the alternative server-hook integration.

[^4]: Drizzle ORM, [Get Started with Drizzle and Turso Cloud](https://orm.drizzle.team/docs/get-started/turso-new). Documents `@libsql/client`, local and remote protocols, Turso dialect configuration, and generate/migrate workflow.

[^5]: Turso, [Concurrent Writes](https://docs.turso.tech/tursodb/concurrent-writes). Documents the default single-writer behavior and conflict/retry requirement for concurrent writes.

[^6]: Turso, [Transactions](https://docs.turso.tech/sql-reference/statements/transactions). Documents atomic explicit transactions, autocommit, savepoints, and transaction modes.

[^7]: Turso, [Cloud limitations](https://docs.turso.tech/cloud/limitations). Documents unsupported or read-only pragmas including `user_version`, `busy_timeout`, and `journal_mode`.

[^8]: Turso, [Point-in-Time Recovery](https://docs.turso.tech/features/point-in-time-recovery). Documents restore into a new database and the required connection/token switch.

[^9]: SQLite, [Datatypes in SQLite](https://www.sqlite.org/datatype3.html) and [Floating Point Numbers](https://sqlite.org/floatingpoint.html). Documents exact signed integer storage and the approximation inherent in binary floating point.
