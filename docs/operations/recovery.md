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

Generate the encryption key in the deployment secret store once and keep it separately from both Turso and backup storage:

```sh
openssl rand -base64 32
```

The daily scheduler runs the export and uploads the resulting file to encrypted, versioned S3-compatible object storage:

```sh
BACKUP_ENCRYPTION_KEY=... \
TURSO_DATABASE_URL=libsql://... \
TURSO_AUTH_TOKEN=... \
pnpm --filter @dukat/db db:backup -- /secure-staging/dukat-$(date -u +%F).backup.json
```

Upload only after the command succeeds, remove the staging copy after a verified upload, enforce 30-day object retention, and alert on command/upload failure or stale backup age. Never pass the key as a command-line argument or store it beside the export.

## Restore drill or incident recovery

1. Put the application in maintenance mode and stop all writers.
2. Select the recovery point. For Turso PITR, create a new database at that point and issue a new token. For a logical backup, create a new empty database; never restore over the source.
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

6. When financial tables exist, additionally verify transfer pairs, import-batch counts, and representative account balance recalculations as required by ADR-0001.
7. Update the application secret to the new URL and newly issued token, deploy/restart, and wait for `/api/health/ready` to succeed.
8. Reopen traffic, monitor errors and write success, revoke the old token, and securely remove the downloaded backup.
9. Record elapsed recovery time, selected recovery point, checks performed, and any follow-up actions. Perform this drill before launch and at least quarterly.

Do not delete the old database during the incident. Retain it until the recovery is reviewed and the normal retention policy permits removal.
