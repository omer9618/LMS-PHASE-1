#!/usr/bin/env bash
# Shared helpers for the scripts in deploy/scripts. Sourced, never run directly.
# Every script runs from the environment directory (/opt/lms/<environment>), which holds
# compose.yml, .env, api.env and (optionally) backup.env.

STACK_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$STACK_DIR" || exit 1

log() { printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${SCRIPT_NAME:-lms}" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

# Value of KEY in a KEY=value file, without surrounding quotes. Empty if absent.
env_get() {
  local file=$1 key=$2 line
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1) || true
  line=${line#*=}
  line=${line%\"}
  line=${line#\"}
  printf '%s' "$line"
}

# Set KEY=value in a file, replacing an existing line or appending one.
env_set() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp "${file}.XXXXXX")
  if grep -qE "^${key}=" "$file"; then
    awk -v k="$key" -v v="$value" 'index($0, k "=") == 1 { print k "=" v; next } { print }' \
      "$file" >"$tmp"
  else
    cat "$file" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$file"
}

require_file() {
  [ -f "$1" ] || die "$1 is missing in $STACK_DIR (copy it from the .example file, see docs/DEPLOYMENT.md)"
}

compose() { docker compose "$@"; }

STACK_NAME=$(env_get .env STACK_NAME)

# ── Backups (backup.sh, restore.sh) ─────────────────────────────────────────

# Sets BACKUP_* globals for the calling script.
# shellcheck disable=SC2034
load_backup_config() {
  require_file backup.env
  BACKUP_S3_BUCKET=$(env_get backup.env BACKUP_S3_BUCKET)
  BACKUP_S3_PREFIX=$(env_get backup.env BACKUP_S3_PREFIX)
  BACKUP_S3_PREFIX=${BACKUP_S3_PREFIX%/}
  BACKUP_S3_REGION=$(env_get backup.env BACKUP_S3_REGION)
  BACKUP_S3_ENDPOINT=$(env_get backup.env BACKUP_S3_ENDPOINT)
  BACKUP_RETENTION_DAYS=$(env_get backup.env BACKUP_RETENTION_DAYS)
  BACKUP_MIN_KEEP=$(env_get backup.env BACKUP_MIN_KEEP)
  BACKUP_LOCAL_DIR=$(env_get backup.env BACKUP_LOCAL_DIR)
  BACKUP_LOCAL_KEEP=$(env_get backup.env BACKUP_LOCAL_KEEP)
  BACKUP_HEARTBEAT_URL=$(env_get backup.env BACKUP_HEARTBEAT_URL)
  BACKUP_AWS_CLI_IMAGE=$(env_get backup.env BACKUP_AWS_CLI_IMAGE)

  [ -n "$BACKUP_S3_BUCKET" ] || die "BACKUP_S3_BUCKET is not set in backup.env"
  [ -n "$BACKUP_S3_PREFIX" ] || die "BACKUP_S3_PREFIX is not set in backup.env"
  [ -n "$(env_get backup.env BACKUP_S3_ACCESS_KEY_ID)" ] || die "BACKUP_S3_ACCESS_KEY_ID is not set"
  [ -n "$(env_get backup.env BACKUP_S3_SECRET_ACCESS_KEY)" ] || die "BACKUP_S3_SECRET_ACCESS_KEY is not set"
  BACKUP_S3_REGION=${BACKUP_S3_REGION:-auto}
  BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
  BACKUP_MIN_KEEP=${BACKUP_MIN_KEEP:-7}
  BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/var/backups/$STACK_NAME}
  BACKUP_LOCAL_KEEP=${BACKUP_LOCAL_KEEP:-3}
  BACKUP_AWS_CLI_IMAGE=${BACKUP_AWS_CLI_IMAGE:-amazon/aws-cli:2.27.0}
  [[ $BACKUP_RETENTION_DAYS =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a whole number"
  [[ $BACKUP_MIN_KEEP =~ ^[0-9]+$ ]] || die "BACKUP_MIN_KEEP must be a whole number"
  [[ $BACKUP_LOCAL_KEEP =~ ^[0-9]+$ ]] || die "BACKUP_LOCAL_KEEP must be a whole number"
}

# The AWS CLI, in a container so the host needs nothing but Docker. Data goes through
# stdin/stdout (`s3 cp - ...`), never a bind mount. Credentials are passed by name, so they
# never appear in `ps` output.
s3cli() {
  local endpoint_args=()
  [ -z "$BACKUP_S3_ENDPOINT" ] || endpoint_args=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  AWS_ACCESS_KEY_ID=$(env_get backup.env BACKUP_S3_ACCESS_KEY_ID) \
    AWS_SECRET_ACCESS_KEY=$(env_get backup.env BACKUP_S3_SECRET_ACCESS_KEY) \
    AWS_DEFAULT_REGION=$BACKUP_S3_REGION \
    docker run --rm -i \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
    -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    "$BACKUP_AWS_CLI_IMAGE" "${endpoint_args[@]}" "$@"
}

# psql inside the postgres container, as the lms superuser.
psql_exec() { compose exec -T postgres psql -U lms -v ON_ERROR_STOP=1 -X -q "$@"; }

# Health of one container: healthy, unhealthy, starting, or none (no healthcheck / gone).
container_health() {
  local state
  state=$(docker inspect --format \
    '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" \
    2>/dev/null) || state='gone gone'
  case "$state" in
    running\ *) echo "${state#running }" ;;
    *) echo gone ;;
  esac
}

# Wait until a container reports healthy. Returns 1 on unhealthy, exit, or timeout.
wait_healthy() {
  local id=$1 timeout=${2:-120} waited=0 status
  while [ "$waited" -lt "$timeout" ]; do
    status=$(container_health "$id")
    case "$status" in
      healthy) return 0 ;;
      unhealthy | gone) return 1 ;;
    esac
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}
