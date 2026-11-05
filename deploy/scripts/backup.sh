#!/usr/bin/env bash
# Back up this environment's database to S3-compatible storage, then apply retention.
#
#   scripts/backup.sh [label]     # label: daily (default), predeploy, manual, ...
#
# 1. pg_dump (custom format, compressed) from the postgres container into BACKUP_LOCAL_DIR.
# 2. Checks the dump is a readable archive (pg_restore --list) before trusting it.
# 3. Uploads <name>.dump and <name>.dump.sha256, then checks the uploaded size.
# 4. Deletes dumps older than BACKUP_RETENTION_DAYS from the bucket, always keeping the newest
#    BACKUP_MIN_KEEP, and keeps the newest BACKUP_LOCAL_KEEP on the server.
# 5. Pings BACKUP_HEARTBEAT_URL if set.
#
# Daily via cron (docs/BACKUP_RESTORE.md). Exits non-zero on any failure.
set -euo pipefail
SCRIPT_NAME=backup
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

label=${1:-daily}
[[ $label =~ ^[a-z0-9-]{1,32}$ ]] || die "label must be lowercase letters, digits and dashes"
[ -n "$STACK_NAME" ] || die "STACK_NAME is not set in .env"
load_backup_config

mkdir -p "$BACKUP_LOCAL_DIR"
chmod 700 "$BACKUP_LOCAL_DIR"
# One backup at a time per environment (cron and a deploy could overlap).
exec 9>"$BACKUP_LOCAL_DIR/.backup.lock"
flock -n 9 || die "another backup is running"

name="${STACK_NAME}-$(date -u +%Y%m%dT%H%M%SZ)-${label}.dump"
file="$BACKUP_LOCAL_DIR/$name"
partial="$BACKUP_LOCAL_DIR/.${name}.partial"
trap 'rm -f "$partial"' EXIT

log "dumping database to $file"
compose exec -T postgres pg_dump -U lms -d lms --format=custom --compress=6 >"$partial"
[ -s "$partial" ] || die "pg_dump produced an empty file"
compose exec -T postgres pg_restore --list <"$partial" >/dev/null || die "the dump is not a readable archive"
mv "$partial" "$file"
chmod 600 "$file"

size=$(stat -c %s "$file")
sha=$(sha256sum "$file" | cut -d ' ' -f 1)
key="$BACKUP_S3_PREFIX/$name"
log "uploading s3://$BACKUP_S3_BUCKET/$key ($size bytes, sha256 $sha)"
s3cli s3 cp --only-show-errors - "s3://$BACKUP_S3_BUCKET/$key" <"$file"
printf '%s  %s\n' "$sha" "$name" | s3cli s3 cp --only-show-errors - "s3://$BACKUP_S3_BUCKET/$key.sha256"

remote_size=$(s3cli s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$key" \
  --query ContentLength --output text)
[ "$remote_size" = "$size" ] || die "uploaded size $remote_size does not match local size $size"

# ── Retention in the bucket ──
cutoff=$(date -u -d "-${BACKUP_RETENTION_DAYS} days" +%Y-%m-%dT%H:%M:%S)
listing=$(s3cli s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix "$BACKUP_S3_PREFIX/" \
  --query 'Contents[].[LastModified,Key]' --output text)
kept=0
deleted=0
while IFS=$'\t' read -r modified object; do
  case "$object" in *.dump) ;; *) continue ;; esac
  kept=$((kept + 1))
  # Newest first: the first BACKUP_MIN_KEEP dumps survive whatever their age.
  if [ "$kept" -gt "$BACKUP_MIN_KEEP" ] && [[ ${modified:0:19} < $cutoff ]]; then
    # </dev/null: s3cli runs `docker run -i`, which would otherwise swallow the loop's input.
    s3cli s3 rm --only-show-errors "s3://$BACKUP_S3_BUCKET/$object" </dev/null
    s3cli s3 rm --only-show-errors "s3://$BACKUP_S3_BUCKET/$object.sha256" </dev/null || true
    deleted=$((deleted + 1))
  fi
done < <(printf '%s\n' "$listing" | grep -v '^None$' | sort -r)
log "retention: deleted $deleted dump(s) older than $BACKUP_RETENTION_DAYS days"

# ── Retention on the server ──
find "$BACKUP_LOCAL_DIR" -maxdepth 1 -name '*.dump' -type f -printf '%T@ %p\n' |
  sort -rn | tail -n +"$((BACKUP_LOCAL_KEEP + 1))" | cut -d ' ' -f 2- |
  while read -r old; do rm -f -- "$old"; done

if [ -n "$BACKUP_HEARTBEAT_URL" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_HEARTBEAT_URL" || log "WARNING: heartbeat ping failed"
fi
log "backup complete: s3://$BACKUP_S3_BUCKET/$key"
