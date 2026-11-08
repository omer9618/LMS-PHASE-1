# Deployment runbook

How the API is built, shipped and run on a VPS (#5, #6, #121, #122). Environments and their configuration: [ENVIRONMENTS.md](ENVIRONMENTS.md). Backups and restores: [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Database schema: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## How it fits together

```
                 GitHub Actions (.github/workflows/deploy.yml)
  CI passes on main ──► build api + tools images ──► push to GHCR ──► SSH to the VPS
                                                                       └─► scripts/deploy.sh <sha>

  VPS (Ubuntu 24.04, Docker)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ /opt/lms/edge         Caddy :80/:443, automatic Let's Encrypt TLS            │
  │                         │  docker network "edge"                             │
  │ /opt/lms/staging      ──┼─► lms-staging-web (Next.js) ── /api/* ─┐            │
  │                         ├─► lms-staging-api ◄────────────────────┘            │
  │                         │     (1 container; 2 during a deploy)               │
  │                         │     └─► postgres (volume pgdata, never published)  │
  │ /opt/lms/production   ──┴─► lms-production-api ─► postgres                   │
  │ cron                  scripts/backup.sh daily ─► S3-compatible backup bucket │
  └──────────────────────────────────────────────────────────────────────────────┘
  Outside: S3 bucket for uploads, SMTP provider, Bunny Stream, Cloudflare Turnstile.
```

| File                              | What it is                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Dockerfile`                      | Two images: `api` (server, production deps only, non-root, healthcheck) and `tools` (migrate/seed) |
| `.dockerignore`                   | Keeps `.env*`, `.git`, tests, docs and `web/` out of the build                                     |
| `web/Dockerfile`                  | The web app: Next.js standalone server, non-root, port 3000, healthcheck; `/api` → `API_URL`       |
| `deploy/compose.yml`              | One environment: `api`, `web` (profile `web`), `postgres`, and the one-off `migrate` service       |
| `deploy/stack.env.example`        | Template for `/opt/lms/<env>/.env` (stack name, images, current tag, database password)            |
| `deploy/api.env.example`          | Template for `/opt/lms/<env>/api.env` (the API's configuration and secrets)                        |
| `deploy/backup.env.example`       | Template for `/opt/lms/<env>/backup.env` (backup bucket, retention)                                |
| `deploy/edge/`                    | Caddy: `compose.yml`, `Caddyfile`, `sites/*.caddy.example`                                         |
| `deploy/scripts/deploy.sh`        | Pull, pre-deploy backup, migrate, rolling restart, record the tag                                  |
| `deploy/scripts/rollback.sh`      | Redeploy the previous tag (no migrations)                                                          |
| `deploy/scripts/backup.sh`        | `pg_dump` to S3 with checksum and retention                                                        |
| `deploy/scripts/restore.sh`       | Restore test into a scratch database, or disaster recovery over the live one                       |
| `deploy/scripts/bootstrap-vps.sh` | One-time server preparation (Docker, deploy user, firewall, directories)                           |
| `.github/workflows/deploy.yml`    | The pipeline. Skipped entirely until the `DEPLOY_SSH_KEY` secret exists                            |

**Request path.** Browsers only talk to the web app's domain. Caddy passes those requests to the Next.js container, which rewrites `/api/*` to the API over the internal network (`API_URL=http://api:3000`), so the session cookie is first-party and no CORS is needed. The API therefore sits behind **two** proxies and compose sets `TRUST_PROXY_HOPS=2`. Caddy (2.5+) ignores any `X-Forwarded-For` a client sends, so the API also sees the real client IP for the few requests that reach it directly through its own domain (Bunny webhooks, `/health`), and per-IP rate limits cannot be dodged by forging the header.

**Web app.** `web/Dockerfile` builds the Next.js standalone server. It runs in the `web` service (on when `.env` has `COMPOSE_PROFILES=web`, the template default) with the network alias `<STACK_NAME>-web`, which the web block of `sites/<env>.caddy` points at. `deploy.sh` rolls it right after the API, with the same tag. Two values are fixed when the image is built, not when it starts:

- **`API_URL`** (default `http://api:3000`, the API's address inside every environment). Next.js resolves `rewrites()` at build time and writes the target into the build output, so a different runtime `API_URL` has no effect. The container checks the runtime `API_URL` against the built one and refuses to start on a mismatch. To use another address, rebuild with `--build-arg API_URL=...`.
- **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`**, inlined into the browser bundle. It comes from the repository variable `TURNSTILE_SITE_KEY`. Use one Turnstile widget that lists every environment's web hostname, so a single image serves staging and production.

Nothing secret is in the repository. Every secret lives in a `chmod 600` file on the server or in GitHub secrets.

## What happens on a deploy

1. **Trigger.** CI succeeds for a push to `main` (staging), or someone runs _Actions > Deploy > Run workflow_ (staging or production, optionally with an existing image tag).
2. **Build** (skipped when an image tag is given): `ghcr.io/<owner>/lms-phase-1-api:<sha>`, `ghcr.io/<owner>/lms-phase-1-tools:<sha>` and `ghcr.io/<owner>/lms-phase-1-web:<sha>`, cached between runs.
3. **Sync.** `deploy/compose.yml` and `deploy/scripts/*.sh` are copied to `/opt/lms/<env>/`, so the server always runs the scripts from the commit being deployed. The `.env`, `api.env` and `backup.env` files are never touched.
4. **Registry login** on the server with the job's own short-lived token, logged out at the end.
5. **`scripts/deploy.sh <sha>`** on the server:
   - pulls the images (api, tools, and web when the `web` profile is on);
   - takes a **pre-deploy backup** (when `backup.env` exists);
   - runs **`prisma migrate deploy`** in the tools image. If it fails, the deploy stops and the running release is untouched;
   - **rolling restart:** starts a second API container on the new image next to the old one, waits for its Docker healthcheck (`GET /health`, which also pings the database), then stops the old one with a 30-second grace period. Caddy re-resolves the API's network alias every 2 seconds and retries a refused connection on the other container, so no request fails. If the new container never becomes healthy, it is removed and the old one keeps serving;
   - the same rolling restart for the **web app**. If only the web roll fails, the API stays on the new release, `.env` records `WEB_TAG=<old>`, and the job fails so someone looks;
   - writes `API_TAG` and `PREVIOUS_API_TAG` to `.env` and prunes images older than 14 days.
6. **Health check** from the runner through Caddy: `https://<api-domain>/health`, then (when `APP_PUBLIC_URL` is set) `https://<web-domain>/api/health`, which exercises the whole browser path, must answer 200.

Verified locally (Docker Desktop, production-mode API, a test Caddy built from `deploy/edge/Caddyfile`): first deploy, a rolling deploy with 314 requests in flight and 0 failures, a deliberately broken release aborted with the old one still serving, and a rollback. With the web app: a first deploy of both services, then a rolling deploy of both with 274 requests in flight (pages and `/api/health` through the web app) and 0 failures; the start-up check refusing a mismatched `API_URL`.

## Migrations: rules for every pull request

Migrations run **before** the new code starts, and the old code keeps serving for a few seconds against the new schema. So every migration must work with the release before it (expand, then contract):

- Adding a table, a nullable column, a column with a default, or an index: safe.
- Renaming or dropping a column or table: two releases. First stop using it in code; drop it in a later release.
- Making a column `NOT NULL`: first backfill and write it in code, then add the constraint in a later release.
- Large tables: `CREATE INDEX CONCURRENTLY` cannot run inside Prisma's migration transaction. Keep index creation on big tables to a quiet window, or ask before merging.

Never edit a migration that has been deployed. A failed migration leaves a row in `_prisma_migrations` with `finished_at` empty: fix forward with a new migration, then `docker compose run --rm migrate node_modules/.bin/prisma migrate resolve --rolled-back <name>` if Prisma refuses to continue. If the data is damaged, restore the pre-deploy backup ([BACKUP_RESTORE.md](BACKUP_RESTORE.md)).

## Scheduled jobs and replicas

Run exactly **one** API container per environment. Jobs (`JOBS_ENABLED=true`: order expiry, purges, payout auto-accept) run inside the API process with no cross-instance lock. During a rolling deploy two containers overlap for about 10–60 seconds, and a job firing in exactly that window would run in both. The hourly and daily jobs fire at minute 00, so `deploy.sh` waits while the clock is at minutes 58–00 before starting the second container. The jobs also update rows conditionally (for example only `PENDING` orders past their expiry become `LAPSED`), so a run after another finds nothing to do; the remaining risk is a duplicate notification email if two runs overlap to the millisecond. New jobs must stay idempotent the same way, or take a Postgres advisory lock.

## Setting it up (owner, once)

These steps need things that do not exist yet: a VPS, SSH access to it, a domain and DNS, and the provider accounts. They are listed in order. Values in angle brackets are yours to choose.

### 1. Provision the VPS (#6)

- Ubuntu 24.04 LTS, x86-64. Staging and production may share one server: 2 vCPU, 4 GB RAM, 60 GB disk is enough for Phase 1. Separate servers (2 GB each for staging) isolate them better.
- Choose a region near the students. Enable the provider's snapshot or backup add-on as a second line of defence.
- Create a deploy key pair on your machine (never on the server):

  ```bash
  ssh-keygen -t ed25519 -C "github-deploy-lms" -f lms_deploy_key -N ""
  ```

- Copy `deploy/scripts/bootstrap-vps.sh` to the server and run it as root:

  ```bash
  scp deploy/scripts/bootstrap-vps.sh root@<server-ip>:/root/
  ssh root@<server-ip> "bash /root/bootstrap-vps.sh '$(cat lms_deploy_key.pub)' staging production"
  ```

  It installs Docker, creates the `deploy` user with that key, turns off password SSH, opens only ports 22/80/443, creates `/opt/lms/{edge,staging,production}` and the `edge` Docker network.

### 2. DNS

Create A (and AAAA, if the server has IPv6) records pointing at the server:

| Name                       | Purpose        |
| -------------------------- | -------------- |
| `api.staging.<domain>`     | Staging API    |
| `staging.<domain>`         | Staging web    |
| `api.<domain>`             | Production API |
| `<domain>`, `www.<domain>` | Production web |

The API's own domain is only needed for provider webhooks (Bunny) and health checks; browsers use the web domain, whose `/api/*` the web app forwards to the API.

### 3. The edge proxy

As `deploy` on the server:

```bash
cd /opt/lms/edge
# copy deploy/edge/{compose.yml,Caddyfile} and deploy/edge/sites/*.example here (scp or git clone)
cp .env.example .env               # set ACME_EMAIL
cp sites/staging.caddy.example sites/staging.caddy        # set the real domains
cp sites/production.caddy.example sites/production.caddy  # when production exists
docker compose up -d
docker compose logs -f caddy       # watch the certificates being issued
```

After editing a site file: `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

### 4. Each environment's configuration

On the server, for `<env>` = `staging`, later `production`:

```bash
cd /opt/lms/<env>
# copy deploy/compose.yml and deploy/scripts/ here (the pipeline refreshes them on every deploy)
cp stack.env.example .env      && chmod 600 .env       # STACK_NAME=lms-<env>, POSTGRES_PASSWORD=$(openssl rand -hex 32)
cp api.env.example api.env     && chmod 600 api.env    # every value: ENVIRONMENTS.md
cp backup.env.example backup.env && chmod 600 backup.env  # BACKUP_RESTORE.md
```

Provider setup for `api.env` (SMTP with SPF/DKIM/DMARC, the uploads bucket, Bunny, Turnstile, the MFA key) is in [INTEGRATIONS.md](INTEGRATIONS.md).

### 5. GitHub configuration

Repository **Settings > Secrets and variables > Actions**:

| Kind                | Name                 | Value                                                                                                    |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| Repository secret   | `DEPLOY_SSH_KEY`     | Contents of `lms_deploy_key` (the private key). **Its presence switches deploys on.**                    |
| Repository variable | `TURNSTILE_SITE_KEY` | The Turnstile widget's public site key (one widget listing every web hostname), built into the web image |

Repository **Settings > Environments**: create `staging` and `production`. In each:

| Kind                 | Name                 | Value                                                                                      |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| Environment secret   | `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <server-ip>` (check the fingerprint against the console) |
| Environment variable | `DEPLOY_HOST`        | Server IP or hostname                                                                      |
| Environment variable | `APP_PUBLIC_URL`     | `https://staging.<domain>` / `https://<domain>` (optional; adds the web health check)      |
| Environment variable | `API_PUBLIC_URL`     | `https://api.staging.<domain>` / `https://api.<domain>`                                    |
| Environment variable | `DEPLOY_USER`        | Optional, default `deploy`                                                                 |
| Environment variable | `DEPLOY_PORT`        | Optional, default `22`                                                                     |
| Environment variable | `DEPLOY_PATH`        | Optional, default `/opt/lms/<environment>`                                                 |

On `production`, add **Required reviewers** (and optionally restrict it to the `main` branch), so a production deploy waits for approval.

The images are pushed to GHCR as private packages linked to the repository. The deploy job pulls them with its own token; nothing else needs access.

### 6. First deploy of an environment

1. Run _Actions > Deploy > Run workflow_, environment `staging`, image tag empty. It builds, migrates the empty database and starts the API.
2. Seed reference data, settings and the first admin, once, on the server:

   ```bash
   cd /opt/lms/staging
   docker compose run --rm migrate npx prisma db seed
   ```

   It needs `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `api.env`. The seed is idempotent and creates no test teachers in production mode.

3. Sign in as that admin through the web app. Enrolment in MFA is forced at first login. Then delete `SEED_ADMIN_PASSWORD` from `api.env` and change the password.
4. Install the daily backup cron and run a restore test ([BACKUP_RESTORE.md](BACKUP_RESTORE.md)).
5. From now on, every merge to `main` that passes CI deploys to staging.

Production: the same steps with `production`, after staging has been verified.

## Routine operations

| Task                   | How                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy to staging      | Merge to `main`. Automatic once CI passes                                                                                                                              |
| Promote to production  | _Actions > Deploy > Run workflow_: environment `production`, image tag = the SHA running on staging (`grep API_TAG /opt/lms/staging/.env`)                             |
| Redeploy a known image | Same, with that tag; no build                                                                                                                                          |
| Roll back              | `ssh deploy@<server> 'cd /opt/lms/<env> && scripts/rollback.sh'` (or `scripts/rollback.sh <tag>`)                                                                      |
| Logs                   | `cd /opt/lms/<env> && docker compose logs -f --tail 200 api`. Every line is JSON with `reqId`; the `x-request-id` response header links a user report to its log lines |
| Status                 | `docker compose ps` (health shown), `curl https://api.<domain>/health`                                                                                                 |
| Change configuration   | Edit `api.env`, then `docker compose up -d api` (recreates the container; a few seconds of 502s), or redeploy the same tag for a rolling restart                       |
| Database shell         | `docker compose exec postgres psql -U lms -d lms`                                                                                                                      |
| Disk space             | `docker system df`; `docker image prune -af --filter until=336h`                                                                                                       |
| Rotate the deploy key  | New key pair, add the public key to `/home/deploy/.ssh/authorized_keys`, update `DEPLOY_SSH_KEY`, remove the old public key                                            |
| Pause all deploys      | Delete the `DEPLOY_SSH_KEY` secret (the workflow becomes a no-op) or disable the workflow                                                                              |

Rollbacks never reverse migrations (see "Migrations" above). If the image was pruned, `rollback.sh` re-pulls it, which needs a registry login on the server first: `echo <PAT with read:packages> | docker login ghcr.io -u <user> --password-stdin`.

## Troubleshooting

| Symptom                                           | Look at                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Workflow says "Deploy skipped"                    | `DEPLOY_SSH_KEY` is not set. Intended until the VPS exists                                                                     |
| "environment is missing: variable DEPLOY_HOST..." | Step 5: the environment's variables and `DEPLOY_KNOWN_HOSTS`                                                                   |
| `Host key verification failed`                    | `DEPLOY_KNOWN_HOSTS` does not match the server (rebuilt server: re-scan)                                                       |
| `.env or api.env is missing on the server`        | Step 4 not done for that environment                                                                                           |
| New container not healthy, deploy aborted         | The log lines printed by the job. Most often `Invalid environment configuration`: a value in `api.env` is missing or wrong     |
| Migrations failed                                 | `docker compose run --rm migrate` by hand to see the error; see "Migrations"                                                   |
| 502 from Caddy                                    | `docker compose ps` in the environment; the API alias in `sites/<env>.caddy` must be `<STACK_NAME>-api`                        |
| No certificate                                    | DNS must point at the server and ports 80/443 must be open before Caddy starts; `docker compose logs caddy` in `/opt/lms/edge` |
