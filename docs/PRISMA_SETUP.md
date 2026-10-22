# Prisma setup — LMS Phase 1

The schema matches **Database Schema v2.0** exactly. Every column name, type, nullability, constraint and index was checked against that document programmatically, not by eye.

## Verification results

| Check                                                | Result                                           |
| ---------------------------------------------------- | ------------------------------------------------ |
| Tables                                               | 29 of 29, none missing, none extra               |
| Column names                                         | Every column in every table matches the document |
| Documented constraints and indexes (§14)             | All 13 present                                   |
| `payment_proofs.transaction_id`                      | Indexed, **not** unique — correct                |
| Composite FK `courses (level_id, board_id) → levels` | Present                                          |
| Undocumented indexes                                 | None                                             |
| Prisma validate                                      | Passes on 7.10.0                                 |

Column names are snake_case in the database, matching the document. Prisma field names are camelCase with `@map` on every field — that is Prisma's convention and does not change the database.

## 1. Install

```bash
npm install prisma@7.10.0 --save-dev
npm install @prisma/client
```

**Pin the version.** `prisma@latest` currently resolves to an 8.0 release candidate.

## 2. Prisma 7 moved the connection URL

`url` is no longer permitted inside `datasource`. It lives in `prisma.config.ts` at the project root:

```ts
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

Most tutorials still show the old syntax. If you copy one, `prisma validate` will reject it.

`.env`:

```
DATABASE_URL="postgresql://user:password@localhost:5432/lms?schema=public"
```

## 3. The citext extension

The document specifies `users.email` as **citext** (case-insensitive text). Prisma expresses this with `@db.Citext`, and the extension must exist before `init` runs.

This is handled by the migration `20260907000000_enable_citext`, dated before `init` so it is applied first on a fresh database. The schema declares the extension (`extensions = [citext]`, `postgresqlExtensions` preview feature) so Prisma does not report drift.

Databases that already applied `init` (with the extension enabled by hand, as this section used to instruct) simply apply the new migration as a no-op — `CREATE EXTENSION IF NOT EXISTS`. `init` itself was not edited.

`citext` is a trusted extension, so the database owner can create it; no superuser is needed.

## 4. First migration

```bash
npx prisma migrate dev --name init
```

On the server:

```bash
npx prisma migrate deploy
```

`migrate dev` can reset data and is for development only. `migrate deploy` only applies pending migrations and is what belongs in the deployment pipeline.

## 5. Verify it yourself

```bash
npx prisma validate

npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > init.sql

grep -c "^CREATE TABLE" init.sql                              # 29
grep "courses_level_id_board_id_fkey" init.sql                # composite FK
grep "payment_proofs_transaction_id" init.sql                 # index, not UNIQUE INDEX
```

The composite foreign key should read:

```sql
ALTER TABLE "courses" ADD CONSTRAINT "courses_level_id_board_id_fkey"
  FOREIGN KEY ("level_id", "board_id") REFERENCES "levels"("id", "board_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

It only exists because `Level` carries `@@unique([id, boardId])`. If anyone deletes that as looking redundant, the constraint disappears silently.

## 6. Two things the document specifies that Prisma cannot express

Prisma has no syntax for database check constraints. The document states two rules that are currently enforced in application code only:

- **Publish guard** — a course cannot move to `PUBLISHED` unless `is_free` is true, or both `price_minor` and `commission_rate_bps` are set.
- `passing_score_pct` is required when `is_breakpoint` is true.

To enforce them in the database, add this to the end of the generated migration by hand:

```sql
ALTER TABLE "courses" ADD CONSTRAINT "courses_publish_guard"
  CHECK (
    status <> 'PUBLISHED'
    OR is_free = true
    OR (price_minor IS NOT NULL AND commission_rate_bps IS NOT NULL)
  );

ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_breakpoint_needs_score"
  CHECK (is_breakpoint = false OR passing_score_pct IS NOT NULL);
```

Prisma will not drop these on later migrations, but it also will not know about them, so `prisma db pull` would not round-trip them. Application-level enforcement is adequate if the check genuinely lives in one place.

## 7. One value the document leaves undefined

`payment_verifications.rejection_reason` is specified as an enum, but the document does not list its values. The schema uses these, taken from FSD section 4.8:

```
NO_PAYMENT_RECEIVED, AMOUNT_SHORT, INVALID_TRANSACTION_ID,
DUPLICATE_TRANSACTION, OTHER
```

**Confirm these before migrating.** Changing an enum after data exists requires a migration.

## 8. Working with this schema in code

### BigInt does not serialise to JSON

All money is `BigInt`. `JSON.stringify` throws on it. Add once, in `main.ts`:

```ts
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
```

Send amounts to the client as strings in minor units and format on the frontend. Never convert to `Number` — that is how rounding errors reach money.

### The ledger is the balance

```ts
const { _sum } = await prisma.teacherLedger.aggregate({
  where: { teacherId },
  _sum: { amountMinor: true },
});
const balanceMinor = _sum.amountMinor ?? 0n;
```

There is no balance column and there should never be one.

### Money moves inside a transaction

Payment confirmation writes the verification, updates the order, grants enrollments and writes ledger entries. All or nothing:

```ts
await prisma.$transaction(async (tx) => {
  await tx.paymentVerification.create({/* ... */});
  await tx.order.update({/* ... */});
  await tx.enrollment.createMany({/* ... */});
  await tx.teacherLedger.createMany({/* ... */});
});
```

### Teacher scoping must be structural

Every query touching courses, enrollments or student records is scoped by owning teacher. Enforcing it in each route handler will eventually be forgotten. Use a Prisma client extension or a repository layer so it is impossible by construction. Prisma's extension API has changed across versions — check current documentation rather than an older tutorial.

## 9. Seeding

Reference data must exist before anything works. `prisma/seed.ts` should insert:

- Boards, and levels per board (levels differ between boards)
- Subjects
- Platform settings — video completion threshold, order expiry window, payout dispute window
- A first admin user

```bash
npx prisma db seed
```

## 10. Migration discipline

- Never edit a migration applied anywhere but your own machine.
- Never change the database by hand. Change the schema, generate a migration.
- Commit migrations; they are part of the codebase.
- `migrate deploy` in CI, never `migrate dev`.

## Deliberate omissions

The following were **not** added, because the document does not specify them. Each may be worth adding later, as a documented change rather than a silent one:

| Not added                                             | Would give                                            |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `boards.name` unique                                  | Prevents duplicate board names                        |
| `subjects.name` unique                                | Prevents duplicate subjects                           |
| `levels (board_id, name)` unique                      | Prevents duplicate level names within a board         |
| `sections (course_id, order_index)` unique            | Prevents two sections claiming the same position      |
| `lessons (section_id, order_index)` unique            | Same, for lessons                                     |
| `video_assets (provider, provider_video_id)` unique   | Prevents the same remote video registered twice       |
| `question_responses (attempt_id, question_id)` unique | One response per question per attempt                 |
| `teacher_profiles.created_at` / `updated_at`          | Audit of profile edits                                |
| `payouts.currency`                                    | Consistency with `teacher_ledger`, which has currency |

The last two were in an earlier draft of this schema and have been removed to match the document exactly.
