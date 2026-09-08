# Database release and recovery runbook

## Recovery objectives

- Keep one AES-256-GCM encrypted logical export in storage outside Turso every day.
- Retain daily exports for 30 days and alert when the newest successful export is over 24 hours old.
- Target a recovery point of at most 24 hours from logical backup and recovery within four hours.
- Use Turso point-in-time recovery first when it provides a smaller loss window, while retaining the independent export path.

The commands write structured success events only. They do not log database contents, credentials, encryption keys, or output paths.

## Release migration

The release job, never an application instance, applies the checked-in migration chain once before compatible application code starts:

```sh
TURSO_DATABASE_URL=libsql://... \
TURSO_AUTH_TOKEN=... \
pnpm --filter @dukat/db db:migrate:release
```

Before a production migration, confirm a current recoverable backup exists. Apply expand/migrate/contract changes over separate releases when a schema change is destructive.

## Daily encrypted backup

The Worker Cron Trigger creates `daily/YYYY-MM-DD.backup.json` once per UTC day in the private
`dukat-backups` R2 bucket. It exports through a consistent read transaction with 64-bit integer mode,
encrypts the logical SQL with AES-256-GCM, then uploads it. A failed run is retried by the next hourly
trigger. The `/admin` job table shows success, failure code, and attempt count without backup contents.

Generate the encryption key in the deployment secret store once and keep it separately from both Turso and R2:

```sh
openssl rand -base64 32
```

Store it as the `BACKUP_ENCRYPTION_KEY` Worker secret and the same-named GitHub Actions secret. Do not
put it in Turso, R2 object metadata, source control, or logs. Apply R2 expiry once during setup:

```sh
pnpm --filter @dukat/server configure:backups
```

Confirm it with `wrangler r2 bucket lifecycle list dukat-backups`. The R2 binding grants the Worker
access only to this bucket. The Worker Turso token has data read/add/update/delete access only; it has
no schema or platform management access.

## Automated daily restore check

`.github/workflows/recovery-check.yml` downloads that day's encrypted object into a temporary runner,
restores it into a new empty local database, and runs SQLite integrity, foreign-key, Personal workspace,
transfer-shape, and Household expense source and allocation checks. The runner is destroyed after the
job. GitHub Actions reports a missing, undecryptable, unrestorable, or inconsistent backup as a failed
scheduled run.

Configure these GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_BACKUP_READ_TOKEN`: account-scoped Cloudflare API token with only R2 read access
- `BACKUP_ENCRYPTION_KEY`: the independently stored key

The check runs at 03:47 UTC, after the 00:17 Worker trigger. It can also be dispatched for a specific
UTC date. Inspect `/admin` daily for failed Worker backup or maintenance runs, and configure
notifications for failed `Recovery check` workflow runs.

## Turso point-in-time recovery

The selected Turso Free plan supports recovery to any commit in the previous 24 hours. Turso creates
backups automatically at commit. Developer, Scaler, and Pro extend the window to 10, 30, and 90 days.
PITR creates a new database and counts against the plan's database quota; it never overwrites the
source. Confirm current terms in the [Turso PITR documentation](https://docs.turso.tech/features/point-in-time-recovery).

For a timestamp inside the selected plan window:

```sh
turso db create dukat-recovery-YYYYMMDDHHMM \
  --from-db dukat-production \
  --timestamp 2026-09-08T02:00:00Z \
  --wait
turso db tokens create dukat-recovery-YYYYMMDDHHMM \
  -p all:data_read,data_add,data_update,data_delete \
  --expiration never
```

Run `db:integrity` against the new URL and token before changing Worker secrets. Follow the incident
steps below. Keep the source until review and revoke its old token after traffic moves.

## Restore drill or incident recovery

1. Put the application in maintenance mode and stop all writers.
2. Select the recovery point. For Turso PITR, use the command above and issue a new data-only token. For a logical backup, create a new empty database; never restore over the source.
3. Download the selected encrypted export to a restricted temporary path.
4. Restore it into the **new empty database**:

   ```sh
   BACKUP_ENCRYPTION_KEY=... \
   TURSO_DATABASE_URL=libsql://new-database... \
   TURSO_AUTH_TOKEN=new-token... \
   pnpm --filter @dukat/db db:restore -- /restricted/dukat-YYYY-MM-DD.backup.json
   ```

   Restore refuses a non-empty target and automatically runs SQLite integrity, foreign-key, and one-personal-workspace-per-user checks.

5. Run the smoke check independently and inspect representative workspace membership before switching traffic:

   ```sh
   TURSO_DATABASE_URL=libsql://new-database... \
   TURSO_AUTH_TOKEN=new-token... \
   pnpm --filter @dukat/db db:integrity
   ```

6. The automated checks verify transfer pairs. Additionally compare representative account balance
   recalculations and expected record counts before switching traffic.
7. Update the application secret to the new URL and newly issued token, deploy/restart, and wait for `/api/health/ready` to succeed.
8. Reopen traffic, monitor errors and write success, revoke the old token, and securely remove the downloaded backup.
9. Record elapsed recovery time, selected recovery point, checks performed, and any follow-up actions. Perform this drill before launch and at least quarterly.

Do not delete the old database during the incident. Retain it until the recovery is reviewed and the normal retention policy permits removal.
