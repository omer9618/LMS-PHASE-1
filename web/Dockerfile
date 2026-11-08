# syntax=docker/dockerfile:1.7
#
# LMS web app image (Next.js standalone server). Build from this directory:
#
#   docker build -t lms-web web/
#
# Runs as the `node` user on port 3000. The browser only talks to this server; it forwards
# /api/* to the API at API_URL (default http://api:3000, the API's address in every compose
# environment). Next.js fixes rewrite targets at build time, so API_URL is a build argument;
# the container's runtime API_URL is checked against it at start (docker-entrypoint.sh).
# See docs/DEPLOYMENT.md.

ARG NODE_VERSION=22

# ── deps ────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
# Public build-time values (inlined into the browser bundle). One Turnstile widget can list
# every environment's hostname, so a single image serves staging and production.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
# The /api rewrite target recorded at build. The container's runtime API_URL must match;
# http://api:3000 is the API's address inside every environment's compose network.
ARG API_URL=http://api:3000
ENV NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
  API_URL=${API_URL}
COPY . .
RUN npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS web
ARG API_URL=http://api:3000
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  API_URL=${API_URL}
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
# Root-owned: the server process can read its code but not change it. Next writes its
# image-optimisation cache under .next/cache, so only that directory belongs to `node`.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh ./
RUN mkdir -p .next/cache && chown node:node .next/cache \
  && printf '%s' "$API_URL" >/app/.api-url
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
