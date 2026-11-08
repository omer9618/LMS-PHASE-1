#!/bin/sh
# Start the Next.js standalone server, refusing a runtime API_URL the image was not built for.
#
# Next.js resolves `rewrites()` (next.config.ts: /api/* -> API_URL) at build time and records
# the result in the build output, so setting API_URL on the container cannot change where /api
# goes. Fail loudly instead of silently proxying somewhere else. To change it, rebuild with
# --build-arg API_URL=...
set -eu
built=$(cat /app/.api-url)
if [ -n "${API_URL:-}" ] && [ "${API_URL%/}" != "${built%/}" ]; then
  echo "API_URL=$API_URL but this image forwards /api to $built (set at build time)." >&2
  echo "Rebuild with: docker build --build-arg API_URL=$API_URL web/" >&2
  exit 1
fi
exec node server.js
