# syntax=docker/dockerfile:1.7
#
# LMS API image (#5, #121). Two targets from one build:
#
#   api   (default) - the NestJS server. Production dependencies only, runs as the `node` user.
#   tools           - one-off release tasks: `prisma migrate deploy` and `prisma db seed`.
#                     Has the Prisma CLI and tsx, which are dev dependencies.
#
#   docker build -t lms-api .                  # api
#   docker build --target tools -t lms-tools . # tools
#
# Debian slim, not Alpine: Prisma's schema engine and bcrypt's prebuilt binary target glibc.

ARG NODE_VERSION=22

# ── deps: every dependency, from the lockfile ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
# openssl: Prisma's schema engine links against it. ca-certificates: TLS to S3, SMTP, Bunny.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── build: generate the Prisma client and compile ───────────────────────────
FROM deps AS build
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# prisma.config.ts reads DATABASE_URL at load time; generate never connects, so any URL works.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
  && npm run build

# ── prod-deps: runtime dependencies only, plus the generated client ─────────
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# ── tools: migrations and seed, run once per release ────────────────────────
FROM deps AS tools
ENV NODE_ENV=production \
  NPM_CONFIG_UPDATE_NOTIFIER=false
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
# The seed imports a few pure helpers from src (password hashing, MFA crypto).
COPY src ./src
# Files stay root-owned and read-only to the process (a chown here would copy node_modules).
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ── api: the server (default target, so it is last) ─────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS api
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
  PORT=3000 \
  GIT_SHA=${GIT_SHA}
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
# Root-owned: the server process (node) can read its code but not change it.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
# Node 22 has fetch built in, so no curl in the image.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# tini forwards SIGTERM so Nest's shutdown hooks run and in-flight requests finish.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
