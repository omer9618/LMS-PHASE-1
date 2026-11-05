#!/usr/bin/env bash
# Restore a database backup. By default into a scratch database, as a restore TEST that leaves
# the live database alone; with --into-live, over the live database (disaster recovery).
#
#   scripts/restore.sh                         # test: newest dump in the bucket -> scratch DB
#   scripts/restore.sh --key <s3-key>          # test a specific dump
#   scripts/restore.sh --file <path.dump>      # test a dump already on this server
#   scripts/restore.sh --keep                  # keep the scratch DB (lms_restore_check) after
#   scripts/restore.sh --key <k> --into-live --yes-overwrite-live   # DISASTER RECOVERY
#
# A restore test: downloads and checks the sha256, restores into lms_restore_check in one
# transaction, compares row counts with the live database, boots the current API image against
# the restored copy (jobs off) and waits for its health check, then drops the scratch database.
# The result is appended to BACKUP_LOCAL_DIR/restore-tests.log.
#
# --into-live: takes a safety backup first (unless --no-safety-backup), stops the API, replaces
# the `lms` database with the dump, starts the API and waits until it is healthy.
set -euo pipefail
SCRIPT_NAME=restore
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' >&2; }

key=
file=
into_live=0
confirmed=0
keep=0
safety_backup=1
while [ $# -gt 0 ]; do
  case "$1" in
    --key) key=${2:?--key needs a value}; shift 2 ;;
    --file) file=${2:?--file needs a value}; shift 2 ;;
    --keep) keep=1; shift ;;
    --into-live) into_live=1; shift ;;
    --yes-overwrite-live) confirmed=1; shift ;;
    --no-safety-backup) safety_backup=0; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
done
[ -z "$key" ] || [ -z "$file" ] || die "use --key or --file, not both"
if [ "$into_live" = 1 ] && [ "$confirmed" != 1 ]; then
  die "--into-live replaces the live database; add --yes-overwrite-live to confirm"
fi
[ -n "$STACK_NAME" ] || die "STACK_NAME is not set in .env"

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

# ── 1. Get the dump ──
if [ -n "$file" ]; then
  [ -s "$file" ] || die "$file is missing or empty"
  source_desc=$file
  dump=$file
else
  load_backup_config
  if [ -z "$key" ]; then
    key=$(s3cli s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "$BACKUP_S3_PREFIX/" \
      --query 'Contents[].[LastModified,Key]' --output text |
      grep -v '^None$' | awk -F '\t' '$2 ~ /\.dump$/' | sort -r | head -n 1 | cut -f 2) || true
    [ -n "$key" ] || die "no dumps under s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/"
  fi
  source_desc="s3://$BACKUP_S3_BUCKET/$key"
  dump="$workdir/$(basename "$key")"
  log "downloading $source_desc"
  s3cli s3 cp --only-show-errors "s3://$BACKUP_S3_BUCKET/$key" - >"$dump"
  [ -s "$dump" ] || die "downloaded file is empty"
  if s3cli s3 cp --only-show-errors "s3://$BACKUP_S3_BUCKET/$key.sha256" - >"$workdir/sha256" 2>/dev/null; then
    expected=$(cut -d ' ' -f 1 "$workdir/sha256")
    actual=$(sha256sum "$dump" | cut -d ' ' -f 1)
    [ "$expected" = "$actual" ] || die "sha256 mismatch: expected $expected, got $actual"
    log "sha256 verified ($actual)"
  else
    log "WARNING: no .sha256 next to the dump; integrity not verified"
  fi
fi
compose exec -T postgres pg_restore --list <"$dump" >/dev/null || die "not a readable pg_dump archive"

# Row count of every table in a database, as "table count" lines.
table_counts() {
  printf '%s\n' \
    "SELECT format('SELECT %L, count(*) FROM public.%I', table_name, table_name)" \
    "FROM information_schema.tables" \
    "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name \\gexec" |
    psql_exec -d "$1" -A -t -F ' ' | LC_ALL=C sort
}

restore_into() {
  local db=$1
  psql_exec -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE)"
  psql_exec -d postgres -c "CREATE DATABASE $db OWNER lms"
  log "restoring into $db"
  compose exec -T postgres pg_restore -U lms -d "$db" --no-owner --exit-on-error --single-transaction <"$dump"
}

# ── 2a. Disaster recovery: replace the live database ──
if [ "$into_live" = 1 ]; then
  if [ "$safety_backup" = 1 ]; then
    log "safety backup of the current live database"
    "$STACK_DIR/scripts/backup.sh" pre-restore || die "safety backup failed (rerun with --no-safety-backup if the live database is beyond saving)"
  fi
  log "stopping the API"
  compose stop api
  restore_into lms
  log "starting the API"
  compose up -d --no-deps api
  for id in $(compose ps -q api); do
    wait_healthy "$id" "${HEALTH_TIMEOUT:-180}" || die "the API is not healthy after the restore; check: docker compose logs api"
  done
  log "live database restored from $source_desc"
  exit 0
fi

# ── 2b. Restore test into a scratch database ──
scratch=lms_restore_check
restore_into "$scratch"
[ "$keep" = 1 ] || trap 'psql_exec -d postgres -c "DROP DATABASE IF EXISTS '"$scratch"' WITH (FORCE)" >/dev/null 2>&1 || true; rm -rf "$workdir"' EXIT

migrations=$(psql_exec -d "$scratch" -A -t -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
[ "$migrations" -gt 0 ] || die "the restored database has no applied migrations"

log "row counts (restored / live now):"
table_counts "$scratch" >"$workdir/restored"
table_counts lms >"$workdir/live"
LC_ALL=C join -a 1 -e '-' -o '0,1.2,2.2' "$workdir/restored" "$workdir/live" |
  awk '{ printf "  %-32s %10s / %s\n", $1, $2, $3 }' >&2
tables=$(wc -l <"$workdir/restored")
[ "$tables" -gt 0 ] || die "the restored database has no tables"

# Boot the deployed API image against the restored copy. Jobs off, so nothing is sent.
api_image="$(env_get .env API_IMAGE):$(env_get .env API_TAG)"
log "booting $api_image against the restored database"
password=$(env_get .env POSTGRES_PASSWORD)
smoke=$(docker run -d --rm --network "${STACK_NAME}_default" --env-file api.env \
  -e NODE_ENV=production -e JOBS_ENABLED=false -e PORT=3000 \
  -e "DATABASE_URL=postgresql://lms:${password}@postgres:5432/${scratch}?schema=public" \
  "$api_image")
if wait_healthy "$smoke" 120; then
  result=PASS
else
  docker logs --tail 50 "$smoke" >&2 || true
  result=FAIL
fi
docker rm -f "$smoke" >/dev/null 2>&1 || true

record_dir=${BACKUP_LOCAL_DIR:-$(env_get backup.env BACKUP_LOCAL_DIR)}
record_dir=${record_dir:-/var/backups/$STACK_NAME}
mkdir -p "$record_dir"
printf '%s %s source=%s tables=%s migrations=%s api_boot=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$result" "$source_desc" "$tables" "$migrations" "$result" \
  >>"$record_dir/restore-tests.log"
[ "$result" = PASS ] || die "restore test FAILED: the API did not become healthy on the restored database"
log "restore test PASSED: $tables tables, $migrations migrations, API healthy ($source_desc)"
