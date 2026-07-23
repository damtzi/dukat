# Database backup and recovery

## Targets

- Logical-backup recovery point: at most 24 hours.
- Recovery time: at most four hours.
- Turso point-in-time recovery should be used for a smaller loss window when the selected plan supports it.
- Perform a restore drill before launch and at least quarterly.

The scheduled workflow in `.github/workflows/backup.yml` creates an AES-256-GCM encrypted logical export and copies it to separate S3-compatible storage. Configure a 30-day lifecycle policy on the `daily/` prefix and alert when the newest object is more than 26 hours old. Keep `BACKUP_ENCRYPTION_KEY` outside both Turso and the backup bucket.

## Create a backup

Generate a 32-byte key once and store it in the production secret manager:

```sh
openssl rand -base64 32
```

Then run:

```sh
DATABASE_URL='libsql://production-…' \
DATABASE_AUTH_TOKEN='…' \
BACKUP_ENCRYPTION_KEY='…' \
BACKUP_PATH='./backup/dukat.backup' \
pnpm db:backup
```

Never commit the export or encryption key.

## Restore into a new database

1. Put the application into maintenance mode and stop all writers.
2. Choose the recovery point. Prefer Turso point-in-time recovery when it covers the incident; otherwise download the desired encrypted logical export.
3. Create a **new** Turso database and a new least-privilege application token. Do not restore over the damaged database.
4. Restore the export (the command applies the complete checked-in migration chain first):

   ```sh
   RESTORE_DATABASE_URL='libsql://new-database-…' \
   RESTORE_DATABASE_AUTH_TOKEN='…' \
   BACKUP_ENCRYPTION_KEY='…' \
   BACKUP_PATH='./backup/dukat.backup' \
   pnpm db:restore
   ```

5. Run `pnpm db:check` against the new URL. It verifies SQLite integrity, foreign keys, and personal-workspace ownership/membership. As financial tables are introduced, extend this check with transfer-pair, import-batch, and representative balance recalculation checks before relying on it.
6. Start a staging instance against the restored database. Verify `/health/ready`, sign-in, one representative personal workspace, and expected record counts.
7. Replace the production database URL and token in the secret store, deploy, and verify `/health/live` and `/health/ready`.
8. Reopen traffic and monitor authentication failures, database errors, and backup freshness.
9. Revoke the old database token only after validation. Preserve the damaged database read-only for incident analysis according to the retention policy.

Record the selected recovery point, commands, integrity output, approver, traffic reopen time, and measured RPO/RTO in the incident log. Do not paste tokens, cookies, transaction descriptions, CSV data, or amounts into logs.
