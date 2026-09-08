# Database release and recovery runbook

## Recovery objectives

- Use Turso point-in-time recovery for routine recovery.
- On the selected Free plan, target a recovery point within the previous 24 hours and recovery within four hours.
- Create an optional encrypted logical export before a risky migration or data operation.

The commands write structured success events only. They do not log database contents, credentials, encryption keys, or output paths.

## Release migration

The release job, never an application instance, applies the checked-in migration chain once before compatible application code starts:

```sh
TURSO_DATABASE_URL=libsql://... \
TURSO_AUTH_TOKEN=... \
pnpm --filter @dukat/db db:migrate:release
```

Before a risky production migration, confirm that the Turso recovery window includes the current
state or create the manual export below. Apply expand/migrate/contract changes over separate releases
when a schema change is destructive.

## Optional manual encrypted export

Turso already creates automatic recovery points. For extra protection before a risky operation,
create one logical export. The command reads through a consistent transaction with 64-bit integer
mode and encrypts the SQL with AES-256-GCM.

Generate an encryption key and keep it in a password manager, separate from Turso and the export:

```sh
openssl rand -base64 32
```

Load the saved key into `BACKUP_ENCRYPTION_KEY` through the password manager's shell integration,
then run:

```sh
TURSO_DATABASE_URL=libsql://... \
TURSO_AUTH_TOKEN=... \
pnpm --filter @dukat/db db:backup -- /restricted/dukat-$(date -u +%F).backup.json
```

Store the export in a restricted local or offline location. Do not put the key in source control,
command history, Turso, or beside the export. Delete the export when it is no longer needed.

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
2. Select the recovery point. For Turso PITR, use the command above and issue a new data-only token.
3. For a manual logical export, copy it to a restricted temporary path and create a new empty database. Never restore over the source.
4. Restore a manual export into the **new empty database**:

   ```sh
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

6. The integrity command verifies transfer pairs and Household expense source and allocation data.
   Additionally compare representative account balance recalculations and expected record counts
   before switching traffic.
7. Update the application secret to the new URL and newly issued token, deploy/restart, and wait for `/api/health/ready` to succeed.
8. Reopen traffic, monitor errors and write success, revoke the old token, and securely remove the downloaded backup.
9. Record elapsed recovery time, selected recovery point, checks performed, and any follow-up actions. Perform this drill before launch and at least quarterly.

Do not delete the old database during the incident. Retain it until the recovery is reviewed and the normal retention policy permits removal.
