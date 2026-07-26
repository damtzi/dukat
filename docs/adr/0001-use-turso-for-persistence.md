# Use Turso for persistence

Dukat will use one shared Turso database with Drizzle ORM rather than the template's Postgres setup. Turso provides simple local SQLite development and low operational overhead suitable for a personal and household finance application. Dukat will enforce workspace access in the application because SQLite does not provide the required row-level authorization boundary.

The architecture validation confirmed Better Auth's SQLite Drizzle adapter, Drizzle's native libSQL client and migration workflow, and Turso's atomic transactions and point-in-time recovery. The Hono server will be the only database client. Financial writes that span records will use short transactions, exact money will use integer minor units, and production will use checked-in migrations plus independent daily backups. See `docs/research/turso-architecture-validation.md` for the evidence and operational details.
