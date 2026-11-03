# Environments

| Environment     | Runs                                     | Deployed by                                     | Database                             | Email, files, video, captcha                    |
| --------------- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| **development** | `npm run start:dev` on a laptop          | You                                             | Local Postgres (`lms`)               | Console log, `.storage/`, fake, disabled        |
| **test**        | `npm run test:e2e`, CI                   | CI on every push and PR                         | `lms_test` (wiped by the test setup) | In-memory, `.storage/`, fake, disabled          |
| **staging**     | Docker on the VPS, `/opt/lms/staging`    | Automatically after CI passes on `main`         | Postgres container, daily backups    | Real providers, **separate** bucket and library |
| **production**  | Docker on the VPS, `/opt/lms/production` | Manually (workflow dispatch, reviewer approval) | Postgres container, daily backups    | Real providers                                  |

Staging and production both run with `NODE_ENV=production`, so staging enforces exactly what production enforces (secure cookies, SMTP, S3, Bunny, Turnstile, a real MFA key). Staging must never share a database, bucket, Bunny library or MFA key with production. Use a test sending domain or a provider sandbox for staging email if real students could otherwise receive mail from it.

Branches: `dev` is integration (CI only, no deployment); `main` is the release branch and deploys to staging; production deploys a tag already verified on staging.

## Configuration files on the server

Each environment directory `/opt/lms/<env>/` holds three private files (`chmod 600`, owner `deploy`). They are created from the templates in `deploy/` and never committed.

| File         | Template                    | Read by                        | Holds                                                                                              |
| ------------ | --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `.env`       | `deploy/stack.env.example`  | Docker Compose                 | `STACK_NAME`, image names, `API_TAG` / `PREVIOUS_API_TAG` (written by deploy), `POSTGRES_PASSWORD` |
| `api.env`    | `deploy/api.env.example`    | The API container (`env_file`) | Every API setting and provider secret                                                              |
| `backup.env` | `deploy/backup.env.example` | `backup.sh`, `restore.sh`      | Backup bucket and its key, retention                                                               |

Compose sets `DATABASE_URL` (from `POSTGRES_PASSWORD`), `NODE_ENV=production`, `PORT=3000` and `TRUST_PROXY_HOPS=2` itself, so `api.env` must not. Two hops because browser requests pass Caddy, then the web app's `/api/*` rewrite, before reaching the API ([DEPLOYMENT.md](DEPLOYMENT.md), "Request path"). If the topology ever changes (e.g. a CDN in front of Caddy), change this number with it, or per-IP rate limits and audit IPs will be wrong.

The API validates every variable at startup (`src/config/env.schema.ts`) and exits with a readable list of problems if anything is missing or still a development default. A deploy with a bad `api.env` therefore fails its healthcheck and is rolled back automatically, with that list in the job log.

## API variables (`api.env`)

| Variable                                            | Staging / production value                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `LOG_LEVEL`                                         | `info`                                                                                    |
| `APP_PUBLIC_URL`                                    | `https://staging.<domain>` / `https://<domain>` (links in emails)                         |
| `API_PUBLIC_URL`                                    | `https://api.staging.<domain>` / `https://api.<domain>`                                   |
| `SESSION_COOKIE_NAME`                               | `__Host-lms_session`                                                                      |
| `SESSION_TTL_HOURS`, `SESSION_IDLE_TIMEOUT_MINUTES` | `168`, `720` unless the client decides otherwise                                          |
| `COOKIE_SECURE`                                     | `true` (enforced)                                                                         |
| `COOKIE_SAMESITE`                                   | `lax` (the cookie is first-party on the web origin via its `/api` rewrite)                |
| `MFA_ENCRYPTION_KEY`                                | `openssl rand -base64 32`, different per environment, also kept in the password manager   |
| `MFA_ISSUER`                                        | `LMS` (production), `LMS staging` (staging), so authenticator entries are distinguishable |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM`         | `smtp`, provider URL, `"<Name> <no-reply@<domain>>"`                                      |
| `STORAGE_DRIVER`, `S3_*`, `STORAGE_SIGNING_SECRET`  | `s3`, the environment's private bucket, `openssl rand -base64 48`                         |
| `CAPTCHA_PROVIDER`, `CAPTCHA_SECRET_KEY`            | `turnstile`, the widget's secret key                                                      |
| `VIDEO_PROVIDER`, `BUNNY_*`                         | `bunny`, the environment's Stream library                                                 |
| `JOBS_ENABLED`                                      | `true`                                                                                    |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`           | First install only; remove the password afterwards                                        |

Where each provider value comes from: [INTEGRATIONS.md](INTEGRATIONS.md). Business values that admins can change at runtime (order expiry window, payout dispute window, video completion threshold, application retention) are **platform settings**, not environment variables: see the [admin guide](ADMIN_GUIDE.md#platform-settings).

## Secrets inventory

| Secret                                     | Lives in                            | If lost                                                            |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ |
| `POSTGRES_PASSWORD`                        | `.env` on the server                | Reset with `ALTER ROLE lms PASSWORD ...` inside the container      |
| `MFA_ENCRYPTION_KEY`                       | `api.env` + password manager        | Every admin must re-enrol MFA (an operator clears `mfa_*` columns) |
| `STORAGE_SIGNING_SECRET`                   | `api.env`                           | Generate a new one; outstanding signed links stop working          |
| Provider keys (SMTP, S3, Bunny, Turnstile) | `api.env`                           | Re-issue at the provider                                           |
| Backup bucket key                          | `backup.env`                        | Re-issue; keep it separate from the uploads key                    |
| Deploy SSH private key                     | GitHub secret `DEPLOY_SSH_KEY` only | Generate a new pair (DEPLOYMENT.md, "Rotate the deploy key")       |

Keep a copy of every environment's `.env`, `api.env` and `backup.env` in the team password manager. A database backup cannot be used without the matching `MFA_ENCRYPTION_KEY`.
