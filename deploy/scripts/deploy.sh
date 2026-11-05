#!/usr/bin/env bash
# Deploy one release of the API to this environment, with no downtime.
#
#   scripts/deploy.sh <image-tag>
#
# 1. Pulls the api and tools images for <image-tag> (the registry login is the caller's job).
# 2. Takes a pre-deploy backup if backup.env exists (SKIP_PREDEPLOY_BACKUP=1 to skip).
# 3. Applies pending migrations (`prisma migrate deploy`). Stops here if they fail.
# 4. Rolling restart: starts a second API container on the new image beside the old one,
#    waits for its health check, then stops the old one. Caddy sends traffic to both meanwhile.
#    If the new container never becomes healthy it is removed and the old one keeps serving.
# 5. Records the tag in .env (API_TAG, PREVIOUS_API_TAG) and prunes old images.
#
# Environment: HEALTH_TIMEOUT (seconds, default 180), SKIP_MIGRATE=1 (used by rollback.sh).
set -euo pipefail
SCRIPT_NAME=deploy
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

tag=${1:-}
[ -n "$tag" ] || die "usage: scripts/deploy.sh <image-tag>"
[[ $tag =~ ^[A-Za-z0-9._-]{1,128}$ ]] || die "invalid image tag: $tag"
require_file .env
require_file api.env
require_file compose.yml
[ -n "$STACK_NAME" ] || die "STACK_NAME is not set in .env"
docker network inspect edge >/dev/null 2>&1 || die "docker network 'edge' is missing (see docs/DEPLOYMENT.md)"

health_timeout=${HEALTH_TIMEOUT:-180}
current_tag=$(env_get .env API_TAG)
log "deploying $STACK_NAME: ${current_tag:-none} -> $tag"

# Shell variables beat .env, so this run uses the new tag while .env still names the old one.
export API_TAG=$tag

log "pulling images"
compose pull --quiet api
compose --profile tools pull --quiet migrate

log "starting postgres (no-op when already running)"
compose up -d --wait postgres

if [ -f backup.env ] && [ "${SKIP_PREDEPLOY_BACKUP:-0}" != 1 ]; then
  log "pre-deploy backup"
  "$STACK_DIR/scripts/backup.sh" predeploy
fi

if [ "${SKIP_MIGRATE:-0}" != 1 ]; then
  log "applying migrations"
  compose run --rm migrate || die "migrations failed; the running release is unchanged (see docs/BACKUP_RESTORE.md if the database needs restoring)"
fi

mapfile -t old_ids < <(compose ps -q api)

# Hourly and daily jobs fire on the hour, and jobs have no cross-container lock. Keep the
# window where two containers run side by side away from minute 00 (docs/DEPLOYMENT.md).
while [ "${#old_ids[@]}" -gt 0 ] && [[ $(date -u +%M) =~ ^(58|59|00)$ ]]; do
  log "waiting for minute 01 so the overlap does not straddle the hourly jobs"
  sleep 20
done

if [ "${#old_ids[@]}" -eq 0 ]; then
  log "no API running yet: starting it"
  compose up -d --no-deps api
  new_id=$(compose ps -q api | head -n 1)
  wait_healthy "$new_id" "$health_timeout" || {
    compose logs --tail 100 api >&2 || true
    die "the API did not become healthy within ${health_timeout}s"
  }
else
  log "rolling restart: starting the new container beside ${#old_ids[@]} running"
  compose up -d --no-deps --no-recreate --scale "api=$((${#old_ids[@]} + 1))" api
  new_id=
  for id in $(compose ps -q api); do
    is_old=0
    for old in "${old_ids[@]}"; do [ "$id" = "$old" ] && is_old=1; done
    [ "$is_old" = 1 ] || new_id=$id
  done
  [ -n "$new_id" ] || die "could not find the new API container"

  if ! wait_healthy "$new_id" "$health_timeout"; then
    log "new container is not healthy; its last log lines:"
    docker logs --tail 100 "$new_id" >&2 || true
    docker rm -f "$new_id" >/dev/null
    die "deploy aborted; the previous release (${current_tag:-none}) is still serving"
  fi

  log "new container healthy; stopping the old one(s)"
  for old in "${old_ids[@]}"; do
    docker stop --time 30 "$old" >/dev/null
    docker rm "$old" >/dev/null
  done
fi

env_set .env PREVIOUS_API_TAG "$current_tag"
env_set .env API_TAG "$tag"
log "deployed $tag (previous: ${current_tag:-none})"

# Keep the disk from filling with old releases. Rollback re-pulls from the registry if needed.
docker image prune -af --filter "until=336h" >/dev/null 2>&1 || true
