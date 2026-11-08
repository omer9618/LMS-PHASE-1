#!/usr/bin/env bash
# Deploy one release (the API, and the web app when the `web` profile is on) with no downtime.
#
#   scripts/deploy.sh <image-tag>
#
# 1. Pulls the api, tools (and web) images for <image-tag> (the registry login is the caller's job).
# 2. Takes a pre-deploy backup if backup.env exists (SKIP_PREDEPLOY_BACKUP=1 to skip).
# 3. Applies pending migrations (`prisma migrate deploy`). Stops here if they fail.
# 4. Rolling restart of the API, then of the web app: a second container on the new image
#    starts beside the old one, its health check is awaited, then the old one stops. Caddy sends
#    traffic to both meanwhile. A new container that never becomes healthy is removed and the
#    old one keeps serving.
# 5. Records the tag in .env (API_TAG, PREVIOUS_API_TAG) and prunes old images.
#
# The web app runs when COMPOSE_PROFILES in .env includes `web`. Its tag follows API_TAG unless
# WEB_TAG is set; deploy.sh sets WEB_TAG only when the web roll failed, to record what runs.
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
export WEB_TAG=$tag

web_enabled=0
[[ ,$(env_get .env COMPOSE_PROFILES), == *,web,* ]] && web_enabled=1

log "pulling images"
compose pull --quiet api
compose --profile tools pull --quiet migrate
[ "$web_enabled" = 0 ] || compose pull --quiet web

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

# Replace the running containers of one service with one on the new image, without a gap.
# Returns 1 (after removing the new container) if it never becomes healthy.
roll_service() {
  local service=$1 new_id='' id old is_old
  local -a old_ids
  mapfile -t old_ids < <(compose ps -q "$service")

  if [ "$service" = api ]; then
    # Hourly and daily jobs fire on the hour, and jobs have no cross-container lock. Keep the
    # window where two containers run side by side away from minute 00 (docs/DEPLOYMENT.md).
    while [ "${#old_ids[@]}" -gt 0 ] && [[ $(date -u +%M) =~ ^(58|59|00)$ ]]; do
      log "waiting for minute 01 so the overlap does not straddle the hourly jobs"
      sleep 20
    done
  fi

  if [ "${#old_ids[@]}" -eq 0 ]; then
    log "$service: not running yet, starting it"
    compose up -d --no-deps "$service"
    new_id=$(compose ps -q "$service" | head -n 1)
    if ! wait_healthy "$new_id" "$health_timeout"; then
      compose logs --tail 100 "$service" >&2 || true
      log "$service did not become healthy within ${health_timeout}s"
      return 1
    fi
    return 0
  fi

  log "$service: rolling restart, starting the new container beside ${#old_ids[@]} running"
  compose up -d --no-deps --no-recreate --scale "$service=$((${#old_ids[@]} + 1))" "$service"
  for id in $(compose ps -q "$service"); do
    is_old=0
    for old in "${old_ids[@]}"; do [ "$id" = "$old" ] && is_old=1; done
    [ "$is_old" = 1 ] || new_id=$id
  done
  [ -n "$new_id" ] || die "could not find the new $service container"

  if ! wait_healthy "$new_id" "$health_timeout"; then
    log "$service: new container is not healthy; its last log lines:"
    docker logs --tail 100 "$new_id" >&2 || true
    docker rm -f "$new_id" >/dev/null
    return 1
  fi

  log "$service: new container healthy; stopping the old one(s)"
  for old in "${old_ids[@]}"; do
    docker stop --time 30 "$old" >/dev/null
    docker rm "$old" >/dev/null
  done
}

roll_service api || die "deploy aborted; the previous release (${current_tag:-none}) is still serving"

if [ "$web_enabled" = 1 ] && ! roll_service web; then
  # The API already runs the new release. Record that, and that the web app does not.
  env_set .env PREVIOUS_API_TAG "$current_tag"
  env_set .env API_TAG "$tag"
  env_set .env WEB_TAG "$current_tag"
  die "web app not updated: the API runs $tag, the web app still runs ${current_tag:-none}. Fix and redeploy, or run scripts/rollback.sh"
fi

env_set .env PREVIOUS_API_TAG "$current_tag"
env_set .env API_TAG "$tag"
env_set .env WEB_TAG ""
log "deployed $tag (previous: ${current_tag:-none})"

# Keep the disk from filling with old releases. Rollback re-pulls from the registry if needed.
docker image prune -af --filter "until=336h" >/dev/null 2>&1 || true
