# Paperlane (LMS Phase 1)

**Paperlane** is a learning platform where independent teachers publish courses for Cambridge and Edexcel students, students buy them by bank transfer, and admins verify payments and pay teachers out.

**Stack:** NestJS 11 API (this folder) · Next.js 16 web app (`web/`) · PostgreSQL · Prisma 7 (pg driver adapter) · Zod · Jest and Vitest. HTTP-only cookie sessions. Background jobs with `@nestjs/schedule`. Video on Bunny Stream, files on S3-compatible storage, email over SMTP.

| Read this                                              | For                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| [docs/BACKEND_STRUCTURE.md](docs/BACKEND_STRUCTURE.md) | Layer rules, scoping, errors, jobs: **read before writing code**           |
| [docs/DATABASE_RULES.md](docs/DATABASE_RULES.md)       | Schema rules (money, ledger, publish guard) and schema additions           |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)           | Bunny, SMTP, S3, Turnstile and MFA key setup for production                |
| [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md)     | Security review (#119): findings, fixes and open items                     |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)               | Deploy runbook: Docker images, VPS setup, pipeline, rollback               |
| [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md)           | Environments, server config files, secrets inventory                       |
| [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)       | Daily backups to S3, restore test, disaster recovery                       |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)     | Every table and column (generated from the Prisma schema)                  |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)             | Administrator guide: verification, payouts, course approval, users         |
| [web/README.md](web/README.md)                         | The Next.js web app: running it against the API on :3000                   |
| [docs/UI_PLAN.md](docs/UI_PLAN.md)                     | Web UI plan: the Exam Hall design (now Paperlane), zod at the API boundary |

## Quick start

Needs Node.js 22.12+ and PostgreSQL 15+. Development works offline: email is printed to the console, files go to `.storage/`, video and captcha are faked.

```bash
git clone https://github.com/omer9618/LMS-PHASE-1.git
cd LMS-PHASE-1
npm ci
cp .env.example .env
```

Create the databases once, as the Postgres superuser (`psql -U postgres`):

```sql
CREATE ROLE lms LOGIN PASSWORD 'lms_dev_password' CREATEDB;
CREATE DATABASE lms OWNER lms;       -- development
CREATE DATABASE lms_test OWNER lms;  -- e2e tests
```

Then:

```bash
npx prisma generate     # Prisma client (again after every schema change)
npm run db:migrate      # apply migrations
npm run db:seed         # boards, levels, subjects, settings, dev accounts (idempotent)
npm run start:dev       # http://localhost:3000
curl http://localhost:3000/health
```

The app validates every environment variable at startup and refuses to start if one is missing or wrong. `.env.example` documents them all. Production-only requirements are listed in [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

### Dev accounts

| Email                 | Role    | Password              |
| --------------------- | ------- | --------------------- |
| `admin@lms.local`     | ADMIN   | `AdminPassword123!`   |
| `teacher.a@lms.local` | TEACHER | `TeacherPassword123!` |
| `teacher.b@lms.local` | TEACHER | `TeacherPassword123!` |

Override them with `SEED_ADMIN_PASSWORD` and `SEED_TEACHER_PASSWORD`. In production the seed requires `SEED_ADMIN_PASSWORD` and creates no teachers. Register a student with `POST /auth/register`, or at `/register` on the website.

### Run the website

The web app (`web/`) needs the API above running on :3000. In a second terminal:

```bash
cd web
npm ci
npm run dev             # http://localhost:3001
```

Open http://localhost:3001. Details, pages and conventions are in [web/README.md](web/README.md).

**Admins sign in with MFA.** The dev admin's authenticator setup key is `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`: it is not a code. Add it to an authenticator app (Google Authenticator, Authy, …) as a manual entry, and the app then shows a 6-digit code that changes every 30 seconds. `POST /auth/login` returns `{ mfaRequired, challengeToken }`; send both with the current 6-digit code to `POST /auth/login/mfa`.

**Skipping MFA while testing locally.** Set `DEV_SKIP_MFA=true` in `.env` (it is commented out in `.env.example`) and restart the API. Sign-in then needs only the password, and the admin area opens without a code. The API refuses to start with it set unless `NODE_ENV=development`, so production and the e2e tests always enforce MFA. Remove it, or set it to `false`, to test the real flow.

```bash
curl -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"teacher.a@lms.local","password":"TeacherPassword123!"}' \
  http://localhost:3000/auth/login
curl -b cookies.txt http://localhost:3000/auth/me
```

## What's built

| Module (`src/modules/`)       | Issues         | What it does                                                                                                                                                                                     |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`                        | #10–#17        | Registration with email verification, login and logout, server-side sessions, password reset, enforced TOTP MFA for admins, admin account management, rate limits                                |
| `teachers`                    | #18–#23        | Public teacher application with CV and captcha, admin review queue, accounts from applications, deactivation, retention purge                                                                    |
| `courses`                     | #24–#34        | Course state machine, authoring, sections and lessons, review queue, pricing and commission, unpublish, archive, demo (free previews)                                                            |
| `content`                     | #35–#39        | Bunny Stream video (direct upload, webhooks, signed playback), PDF resources, server-side access gate                                                                                            |
| `catalogue`                   | #40–#44        | Public catalogue: search, filters, stated ordering, course detail                                                                                                                                |
| `enrollment`                  | #46–#52        | Free enrollment, admin grants and revokes, expiry, teacher roster (view only), student dashboard with completion                                                                                 |
| `progress`                    | #90–#97, #77   | Lesson completion (AUTO/MANUAL/QUIZ), skip-resistant watch positions, learner outline with derived unlock states and lock causes, checkpoint gating, teacher progress view                       |
| `assessment`                  | #68–#74, #76   | Quiz builder (MCQ, numeric with exact-decimal tolerance, LaTeX text, question images), server-timed attempts, attempt limits, answer reveal rules                                                |
| `orders`                      | #54–#62        | Cart quote, orders with payment reference and frozen price/commission snapshots, payment proofs, duplicate transaction warnings, student order screens, receipts, expiry job                     |
| `profiles`                    | #98–#100       | Teacher public profiles: editor with photo, public page with published courses, admin moderation (audited)                                                                                       |
| `verification`                | #63–#67        | Admin payment queue (waiting time, duplicate and amount warnings), confirm with amount and value date (grants enrollment, writes earnings), reject with reason, mismatch handling, queue metrics |
| `ledger`                      | #78–#89        | Append-only teacher ledger: EARNING entries on payment confirmation, PAYOUT and REFUND entries                                                                                                   |
| `admin`                       | #102–#106      | Admin dashboard queue counts, finance reports, user overview (enrollments, courses taught), admin-triggered password reset                                                                       |
| `payouts`                     | #78–#89        | Admin records payouts to teachers; teachers see their payouts and raise concerns, admins resolve them                                                                                            |
| `audit`                       | #107, #108     | Audit log for sensitive actions, admin search                                                                                                                                                    |
| `platform-settings`           | #8             | Admin-editable settings (thresholds, windows, retention)                                                                                                                                         |
| `reference-data`              | #24            | Boards, levels, subjects                                                                                                                                                                         |
| `email`, `storage`, `captcha` | #110, #19, #18 | Infrastructure adapters (SMTP/log/memory, S3/local disk, Turnstile/disabled)                                                                                                                     |

### Blocked on information from the client or the team

| Needed                                                                                                                                                                                           | Blocks                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Client answers to #125–#134 (enrollment duration, granularity, bank account and currency, order expiry, refunds, payout cycle, turnaround, quiz pass rule, video threshold, "two country views") | Final behaviour of enrollment, orders, payouts and quizzes; values go in platform settings |
| A VPS, its SSH access and a domain                                                                                                                                                               | #5, #6, #119, #120                                                                         |
| Sending domain and its SPF/DKIM/DMARC records                                                                                                                                                    | #110                                                                                       |
| Bunny Stream library ID and keys                                                                                                                                                                 | Verifying #36, #37                                                                         |
| Cloudflare Turnstile keys                                                                                                                                                                        | Captcha in production (#18)                                                                |

## Commands

| Command                                       | What it does                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run start:dev`                           | Dev server with watch mode                                                                                    |
| `npm run build` / `npm start`                 | Compile to `dist/` / run the compiled app                                                                     |
| `npm test`                                    | Unit tests (`src/**/*.spec.ts`), no database                                                                  |
| `npm run test:e2e`                            | HTTP tests (`test/*.e2e-spec.ts`); migrates and seeds `TEST_DATABASE_URL` first, never touches `DATABASE_URL` |
| `npm run lint` / `format:check` / `typecheck` | The checks CI runs                                                                                            |
| `npm run db:migrate` / `db:seed`              | `prisma migrate deploy` / `prisma db seed`                                                                    |
| `npx prisma migrate dev --name <change>`      | New migration after editing the schema (dev only), then `npx prisma generate`                                 |

## API conventions

- Success responses are `{ "success": true, "data": ... }`. Errors are `{ "success": false, "error": { "name", "message", "info", "extended" } }`, where `name` is a stable code such as `ENROLLMENT_REQUIRED`.
- Every response carries `x-request-id`, and every server log line for that request includes it as `reqId`. Clients may send their own.
- Money is a string of minor units (`"150000"`). Never parse it into a float.
- Field names are camelCase. Routes are grouped by caller: public (`/catalogue`, `/auth`), student (`/me`, `/courses/:id/...`), teacher (`/teacher/...`) and admin (`/admin/...`).
- Everything requires a session unless marked public. Teacher data is scoped in the data layer, so another teacher's records answer 404.

## Deployment

Staging and production run in Docker on a VPS behind Caddy (automatic TLS), deployed by `.github/workflows/deploy.yml` over SSH: staging after CI passes on `main`, production by manual dispatch. The workflow does nothing until the `DEPLOY_SSH_KEY` secret is set. Everything for the server is in `deploy/`; the steps are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
docker build -t lms-api .                   # the API image
docker build --target tools -t lms-tools .  # migrations and seed
npm run db:schema-doc    # after a schema change
```

## Working on it

- **Branches:** `main` is the release branch and `dev` the integration branch. Work on `feat/<issue>-<slug>` (or `fix/`, `chore/`, `test/`, `docs/`) and open a PR. CI must pass before merging; merge with a merge commit.
- **Commits** reference issues with `refs #N`. An issue is closed when its Done-when is met and merged, with a note that staging verification follows.
- **CI** (GitHub Actions, on every PR and push to `main` and `dev`): format check, lint (including per-layer import rules), typecheck, unit tests, build, then e2e tests against a Postgres service.
- Unclear requirements are asked about, not guessed. Decisions are recorded in the PR that applies them.
