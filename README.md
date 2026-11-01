# LMS Phase 1

Backend for a learning platform where independent teachers publish courses for Cambridge and Edexcel students, students buy them by bank transfer, and admins verify payments and pay teachers out.

**Stack:** NestJS 11 · PostgreSQL · Prisma 7 (pg driver adapter) · Zod · Jest. HTTP-only cookie sessions. Background jobs with `@nestjs/schedule`. Video on Bunny Stream, files on S3-compatible storage, email over SMTP.

| Read this                                              | For                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| [docs/BACKEND_STRUCTURE.md](docs/BACKEND_STRUCTURE.md) | Layer rules, scoping, errors, jobs: **read before writing code** |
| [docs/PRISMA_SETUP.md](docs/PRISMA_SETUP.md)           | Schema rules (money, ledger, publish guard) and schema additions |
| [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)           | Bunny, SMTP, S3, Turnstile and MFA key setup for production      |
| [docs/backlog/](docs/backlog/)                         | How the GitHub issues were imported; issue-number notes          |

## Quick start

Needs Node.js 20+ and PostgreSQL 15+. Development works offline: email is printed to the console, files go to `.storage/`, video and captcha are faked.

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

Override them with `SEED_ADMIN_PASSWORD` and `SEED_TEACHER_PASSWORD`. In production the seed requires `SEED_ADMIN_PASSWORD` and creates no teachers. Register a student with `POST /auth/register`.

**Admins sign in with MFA.** The dev admin's authenticator secret is `JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP`; add it to any authenticator app as a manual entry. `POST /auth/login` returns `{ mfaRequired, challengeToken }`; send both with the 6-digit code to `POST /auth/login/mfa`.

```bash
curl -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"teacher.a@lms.local","password":"TeacherPassword123!"}' \
  http://localhost:3000/auth/login
curl -b cookies.txt http://localhost:3000/auth/me
```

## What's built

| Module (`src/modules/`)       | Issues         | What it does                                                                                                                                                      |
| ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                        | #10–#17        | Registration with email verification, login and logout, server-side sessions, password reset, enforced TOTP MFA for admins, admin account management, rate limits |
| `teachers`                    | #18–#23        | Public teacher application with CV and captcha, admin review queue, accounts from applications, deactivation, retention purge                                     |
| `courses`                     | #24–#34        | Course state machine, authoring, sections and lessons, review queue, pricing and commission, unpublish, archive, demo (free previews)                             |
| `content`                     | #35–#39        | Bunny Stream video (direct upload, webhooks, signed playback), PDF resources, server-side access gate                                                             |
| `catalogue`                   | #40–#44        | Public catalogue: search, filters, stated ordering, course detail                                                                                                 |
| `enrollment`                  | #46–#52        | Free enrollment, admin grants and revokes, expiry, teacher roster (view only), student dashboard with completion                                                  |
| `audit`                       | #107, #108     | Audit log for sensitive actions, admin search                                                                                                                     |
| `platform-settings`           | #8             | Admin-editable settings (thresholds, windows, retention)                                                                                                          |
| `reference-data`              | #24            | Boards, levels, subjects                                                                                                                                          |
| `email`, `storage`, `captcha` | #110, #19, #18 | Infrastructure adapters (SMTP/log/memory, S3/local disk, Turnstile/disabled)                                                                                      |

### Still to do

- **M2:** cart and orders with frozen price snapshots (#54–#62), payment verification and amount mismatches (#63–#67), quizzes and assessment (#68–#77).
- **M3:** teacher ledger, refunds and payouts (#78–#89), progress and sequential unlock (#90–#97), teacher profiles (#98–#101), admin dashboards and finance reports (#102–#106), remaining email templates (#111–#113), test and hardening tickets (#114–#119).
- **Web app:** Next.js in `/web` (decided), covering the UI tickets (#7, #45, #53, #75, #101, #102, #109, #114) and the screens for everything above.
- **Deployment:** VPS + Docker + GitHub Actions (decided) for staging and production (#5, #6, #120–#123).

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

## Working on it

- **Branches:** `main` is the release branch and `dev` the integration branch. Work on `feat/<issue>-<slug>` (or `fix/`, `chore/`, `test/`, `docs/`) and open a PR. CI must pass before merging; merge with a merge commit.
- **Commits** reference issues with `refs #N`. An issue is closed when its Done-when is met and merged, with a note that staging verification follows.
- **CI** (GitHub Actions, on every PR and push to `main` and `dev`): format check, lint (including per-layer import rules), typecheck, unit tests, build, then e2e tests against a Postgres service.
- Unclear requirements are asked about, not guessed. Decisions are recorded in the PR that applies them.
