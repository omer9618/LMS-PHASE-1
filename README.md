# LMS Phase 1 — backend

NestJS API on PostgreSQL with Prisma 7 (pg driver adapter).

- Code conventions and layer rules: [docs/BACKEND_STRUCTURE.md](docs/BACKEND_STRUCTURE.md)
- Schema rules (money, ledger, scoping, publish guard): [docs/PRISMA_SETUP.md](docs/PRISMA_SETUP.md)
- Backlog: GitHub Issues + the "lms phase 1" project board

## Prerequisites

- Node.js 20 or newer (`node -v`)
- PostgreSQL 15 or newer, running locally

## Run it locally

### 1. Install

```bash
git clone https://github.com/omer9618/LMS-PHASE-1.git
cd LMS-PHASE-1
npm ci
```

### 2. Create the databases

One role, two databases: `lms` for development, `lms_test` for e2e tests. Run as the Postgres superuser (`psql -U postgres`):

```sql
CREATE ROLE lms LOGIN PASSWORD 'lms_dev_password' CREATEDB;
CREATE DATABASE lms OWNER lms;
CREATE DATABASE lms_test OWNER lms;
```

`CREATEDB` lets `prisma migrate dev` create its shadow database. The `citext` extension is created by the first migration; no superuser step is needed.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` if your role, password or port differ. The app validates every variable at startup and refuses to start if one is missing or malformed.

### 4. Migrate, seed, run

```bash
npx prisma generate       # generates the Prisma client (also after every schema change)
npm run db:migrate        # applies migrations
npm run db:seed           # boards, levels, subjects, settings, dev users (idempotent)
npm run start:dev         # http://localhost:3000, restarts on change
```

Check it:

```bash
curl http://localhost:3000/health
# {"success":true,"data":{"status":"ok","database":"up"}}
```

## Dev accounts (seeded, development only)

| Email                 | Role    | Password (default)    | Override with           |
| --------------------- | ------- | --------------------- | ----------------------- |
| `admin@lms.local`     | ADMIN   | `AdminPassword123!`   | `SEED_ADMIN_PASSWORD`   |
| `teacher.a@lms.local` | TEACHER | `TeacherPassword123!` | `SEED_TEACHER_PASSWORD` |
| `teacher.b@lms.local` | TEACHER | `TeacherPassword123!` | `SEED_TEACHER_PASSWORD` |

With `NODE_ENV=production` the seed refuses to run without `SEED_ADMIN_PASSWORD` and creates no teachers. The seed never changes an existing user's password.

Log in (the session is an HTTP-only cookie):

```bash
curl -i -c cookies.txt -H 'content-type: application/json'   -d '{"email":"teacher.a@lms.local","password":"TeacherPassword123!"}'   http://localhost:3000/auth/login
curl -b cookies.txt http://localhost:3000/auth/me
```

## Scripts

| Script                                        | What it does                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:dev`                           | Dev server with watch mode                                                                                                             |
| `npm run build` / `npm start`                 | Compile to `dist/` / run the compiled app                                                                                              |
| `npm test`                                    | Unit tests (`src/**/*.spec.ts`), no database needed                                                                                    |
| `npm run test:e2e`                            | HTTP tests (`test/**/*.e2e-spec.ts`) against `TEST_DATABASE_URL`                                                                       |
| `npm run lint` / `format:check` / `typecheck` | The same checks CI runs                                                                                                                |
| `npm run db:migrate` / `db:seed`              | `prisma migrate deploy` / `prisma db seed`                                                                                             |
| `npx prisma migrate dev --name <change>`      | Create a migration after editing `schema.prisma` (dev only); run `npx prisma generate` afterwards — Prisma 7 no longer does it for you |

## Running tests

`npm run test:e2e` migrates and seeds the database in `TEST_DATABASE_URL` first, then boots the real app against it. It never touches `DATABASE_URL`. If it is unset the run stops with an error.

## API conventions

- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": { "name", "message", "info", "extended" } }`
- Every response carries `x-request-id`. Send your own (`[A-Za-z0-9_-]{1,64}`) to correlate with client logs; every server log line for that request includes it as `reqId`.
- Money is a string of minor units (`"150000"` = 1,500.00). Never parse it into a float.
- Field names are camelCase.

## CI

GitHub Actions runs format check, lint, typecheck, unit tests, build and e2e tests (against a Postgres service container) on every PR to `main`.
