# Backup and restore

Daily PostgreSQL backups to S3-compatible storage, with retention, and a restore procedure that is tested, not assumed (#6, #120). Scripts: `deploy/scripts/backup.sh` and `deploy/scripts/restore.sh`, run on the server from `/opt/lms/<env>/`. They need nothing on the host but Docker: `pg_dump`/`pg_restore` run inside the Postgres container and the AWS CLI runs in a pinned container.

## What is backed up, and what is not

| Data                                                                  | Backed up by                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The database (users, courses, orders, ledger, audit log, settings...) | `backup.sh`: daily, before every deploy, and before a live restore                                                                                           |
| Uploaded files (CVs, payment proofs, PDFs)                            | They live in the uploads bucket, not on the server. Turn on **bucket versioning** (and a lifecycle rule expiring old versions after 30 days) at the provider |
| Videos                                                                | Bunny Stream holds them                                                                                                                                      |
| Configuration and secrets (`.env`, `api.env`, `backup.env`)           | Not by the scripts. Keep a copy in the team password manager (see [ENVIRONMENTS.md](ENVIRONMENTS.md))                                                        |
| The server itself                                                     | Optional provider snapshots. Nothing on the server is irreplaceable except the database                                                                      |

## How a backup works

`scripts/backup.sh [label]`:

1. `pg_dump --format=custom` of the `lms` database into `BACKUP_LOCAL_DIR`, named `<stack>-<UTC timestamp>-<label>.dump`.
2. Checks the dump is a readable archive (`pg_restore --list`); an unreadable dump fails the backup.
3. Uploads it and a `.sha256` file to `s3://<BACKUP_S3_BUCKET>/<BACKUP_S3_PREFIX>/`, then checks the uploaded size matches.
4. Retention: deletes dumps older than `BACKUP_RETENTION_DAYS` (default 30) from the bucket, but always keeps the newest `BACKUP_MIN_KEEP` (default 7), so a stopped cron can never age out every backup. Keeps the newest `BACKUP_LOCAL_KEEP` (default 3) on the server.
5. Pings `BACKUP_HEARTBEAT_URL`, if set.

Any failure exits non-zero and nothing is deleted.

## Setting it up (owner, once per environment)

**Blocked until** the VPS exists and a backup bucket is chosen.

1. **Bucket.** Create a private bucket for backups, separate from the uploads bucket (Cloudflare R2, AWS S3, Backblaze B2, DigitalOcean Spaces...). Ideally a different provider or account from the server, so losing one account does not lose both. Turn on versioning or object lock if available.
2. **Key.** Create an access key limited to that bucket with List, Get, Put and Delete.
3. **Config.** On the server:

   ```bash
   cd /opt/lms/<env>
   cp backup.env.example backup.env && chmod 600 backup.env
   # BACKUP_S3_BUCKET, BACKUP_S3_PREFIX=postgres/lms-<env>, BACKUP_S3_REGION, BACKUP_S3_ENDPOINT,
   # BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_LOCAL_DIR=/var/backups/lms-<env>
   ```

4. **First backup by hand:** `scripts/backup.sh manual`. It should end with `backup complete: s3://...`.
5. **Daily cron** as the `deploy` user (`crontab -e`). Pick a quiet hour, and not minute 00 (jobs run then):

   ```cron
   # LMS staging: daily database backup at 02:17 UTC
   17 2 * * * cd /opt/lms/staging && scripts/backup.sh daily >>/var/backups/lms-staging/backup.log 2>&1
   # LMS production: 02:47 UTC
   47 2 * * * cd /opt/lms/production && scripts/backup.sh daily >>/var/backups/lms-production/backup.log 2>&1
   ```

   The server's clock is UTC (`timedatectl`); cron uses it.

6. **Alerting.** Create a check at healthchecks.io (or an Uptime Kuma push monitor) expecting one ping a day with a few hours' grace, and put its URL in `BACKUP_HEARTBEAT_URL`. Without it, a broken backup is only noticed when it is needed.
7. **Restore test** (next section). Record the result in #120.

## Restore test (do this after setup, then monthly)

A restore test proves a real dump from the bucket can rebuild a working database. It never touches the live database.

```bash
cd /opt/lms/<env>
scripts/restore.sh                    # the newest dump in the bucket
scripts/restore.sh --key postgres/lms-staging/lms-staging-20261103T021700Z-daily.dump   # a specific one
```

It:

1. downloads the dump and verifies its sha256;
2. restores it into a scratch database `lms_restore_check` in one transaction (`--exit-on-error --single-transaction`);
3. checks the Prisma migrations table is there, and prints the row count of every table next to the live count;
4. starts the currently deployed API image against the restored copy, with jobs off so it sends nothing, and waits for its healthcheck;
5. drops the scratch database (`--keep` to inspect it with `docker compose exec postgres psql -U lms -d lms_restore_check`);
6. appends `PASS` or `FAIL` to `BACKUP_LOCAL_DIR/restore-tests.log`.

Expected end: `restore test PASSED: 33 tables, N migrations, API healthy (...)`. Restored counts equal or slightly below live counts are normal (the dump is older than the live data).

**Verified locally** on 2026-11-03 with the production-mode stack under Docker Desktop and an S3-compatible store: backup, upload with checksum, retention (kept the newest `BACKUP_MIN_KEEP`, deleted the rest), restore test (33 tables, row counts matched, API booted on the copy: PASS), and a live restore that brought back a changed setting value. #120's "on staging" part needs the staging server.

## Disaster recovery: restoring over the live database

Use when the live data is damaged (a bad migration, an operator mistake) or the database volume is lost. Expect a few minutes of downtime.

1. Decide which dump to restore. List them:

   ```bash
   docker run --rm -e AWS_ACCESS_KEY_ID=<id> -e AWS_SECRET_ACCESS_KEY=<secret> amazon/aws-cli:2.27.0 \
     --endpoint-url <BACKUP_S3_ENDPOINT> s3 ls s3://<bucket>/postgres/lms-<env>/
   ```

   For a failed deploy, the right one is the `-predeploy` dump just before it.

2. Test it first (`scripts/restore.sh --key <key>`), unless every minute counts.
3. Restore over the live database:

   ```bash
   scripts/restore.sh --key <key> --into-live --yes-overwrite-live
   ```

   It takes a `pre-restore` safety backup of the current state (skip with `--no-safety-backup` if the database is unreadable), stops the API, drops and recreates `lms`, restores in one transaction, starts the API and waits until it is healthy.

4. If the restored data is older than the code (the dump predates a migration), redeploy the current tag so pending migrations run: `scripts/deploy.sh "$(grep ^API_TAG= .env | cut -d= -f2)"`.
5. Anything that happened after the dump is lost from the database. Check payments confirmed and payouts recorded since then against the bank statement and the audit trail in the provider dashboards, and re-enter them.

### Rebuilding on a new server

1. Bootstrap the new server and the edge proxy ([DEPLOYMENT.md](DEPLOYMENT.md), steps 1–3), and point DNS at it.
2. Restore `.env`, `api.env` and `backup.env` from the password manager into `/opt/lms/<env>/`.
3. Deploy the last tag (workflow dispatch with that image tag). This creates an empty, migrated database.
4. `scripts/restore.sh --key <newest dump> --into-live --yes-overwrite-live --no-safety-backup`.

## Recovery objectives

With daily backups the worst case is losing up to 24 hours of database changes (RPO 24 h). Rebuilding from scratch on a new server takes about an hour (RTO about 1 h); a restore on the existing server takes minutes. If the client needs a smaller RPO, run the backup more often (e.g. every 4 hours: `17 */4 * * *`) or add continuous WAL archiving later. **Open question for the client.**
