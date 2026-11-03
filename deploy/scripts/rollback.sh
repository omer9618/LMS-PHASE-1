#!/usr/bin/env bash
# Roll the API back to the previous release (PREVIOUS_API_TAG in .env), or to a given tag.
#
#   scripts/rollback.sh [<image-tag>]
#
# Migrations are NOT reversed: Prisma migrations only go forward, and every migration in this
# project must stay compatible with the release before it (docs/DEPLOYMENT.md, "Migrations").
# If a migration itself broke the data, restore a backup instead (docs/BACKUP_RESTORE.md).
# If the image was pruned, log in first: echo <PAT> | docker login ghcr.io -u <user> --password-stdin
set -euo pipefail
SCRIPT_NAME=rollback
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

target=${1:-$(env_get .env PREVIOUS_API_TAG)}
[ -n "$target" ] || die "no PREVIOUS_API_TAG in .env; pass the tag to roll back to"
log "rolling back to $target"
SKIP_MIGRATE=1 SKIP_PREDEPLOY_BACKUP=1 exec "$STACK_DIR/scripts/deploy.sh" "$target"
