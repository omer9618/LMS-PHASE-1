# Codebase cleanup plan

Audit of the API (`src/`) and the web app (`web/src/`), 2026-11-10. Nothing in this plan has been
done yet. Each phase is its own branch and pull request, and each must pass `typecheck`, `lint`,
unit tests, e2e tests and `next build` before merge.

## Summary

The backend is in good shape: every module has the same layout (`controllers`, `dao`, `domain`,
`schemas`, `services`) and modules only reach each other through services (enforced by ESLint).
The problems are:

| Area            | Problem                                                                                    | Severity                |
| --------------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| Backend money   | Two money formatters; the payout one assumes 2 decimals for every currency                 | **Bug** (payout emails) |
| Backend schemas | 28 route-param schemas and 10 paging schemas copy-pasted across modules                    | Duplication             |
| Web API layer   | Three different module styles; 13 components call `api.*` with inline paths                | Inconsistency           |
| Web forms       | Form schemas in four places; wrapper validators in components                              | Inconsistency           |
| Web async state | `useMutation` is admin-only; ~20 other components hand-roll busy/error state               | Duplication             |
| Web helpers     | Date and money helpers duplicated across `lib/`, `lib/admin/` and `admin/kit.tsx`          | Duplication             |
| Web CSS         | The same rule bodies repeated in up to 10 CSS modules                                      | Duplication             |
| Design system   | Status tones disagree with Exam Hall; glyph/emoji icons; money bypasses `<Money>`          | Drift                   |
| Folders         | Header parts loose in `components/`, public page under `teacher/`, unclear `lib/api` split | Naming                  |
| Workspace       | Empty folders, used-up backlog import, stale setup log, redundant packages                 | Clutter                 |

## Findings

### Backend (`src/`)

**B1. Money formatting is written twice and the copies disagree.**

- `src/modules/orders/domain/order.rules.ts` → `formatAmount(minor, currency)` uses
  `currencyExponent()` (0, 2 or 3 decimals per ISO 4217).
- `src/modules/payouts/domain/payout.rules.ts` → `formatPayoutMoney(amountMinor, currency)`
  divides by `100n` for every currency. A KWD or JPY payout email would show the wrong amount.
- The currency exponent table (`ZERO_DECIMAL_CURRENCIES`, `THREE_DECIMAL_CURRENCIES`,
  `currencyExponent`) lives in the orders rules, though it is not about orders.

**B2. Route-param schemas are copy-pasted.** 28 `*ParamsSchema` definitions, for example:

| Shape                                | Defined in                                                         |
| ------------------------------------ | ------------------------------------------------------------------ |
| `{ courseId: uuid }`                 | `courses`, `enrollment`, `catalogue`, `progress` (and `profiles`)  |
| `{ courseId: uuid, lessonId: uuid }` | `assessment/quiz`, `content`, `courses/outline`, `progress`        |
| `{ teacherId: uuid }`                | `profiles`, `teachers` (same name, `teacherIdParamsSchema`, twice) |

Some use `z.object`, others `z.strictObject`, with no rule.

**B3. Paging is defined 10 times.** `limit` / `offset` with `z.coerce.number().int()…` in `audit`,
`auth/user-admin`, `catalogue`, `courses`, `enrollment`, `profiles`, `progress`, `teachers`,
`verification`. Only the max and default differ (100/50, 200/50, 60/24).

**B4. Query and body schemas mix `z.object` (32) and `z.strictObject` (58).** Non-strict schemas
silently accept unknown keys.

### Web app (`web/src/`)

**W1. Three styles of API module in `lib/api/`.**

| Style                             | Files                                                        |
| --------------------------------- | ------------------------------------------------------------ |
| Flat exported functions           | `admin.ts` (38), `admin-money.ts` (14)                       |
| Exported object `xApi = { … }`    | `teacher.ts`, `profile.ts`, `earnings.ts`, `quiz-builder.ts` |
| Factory `xApi(client)` + instance | `learn.ts`, `orders.ts`                                      |

Auth, catalogue, enrollment and the teacher application have no module at all. These components
call `api.get/post(...)` with the path written inline:

`account/MfaSetup`, `apply/TeacherApplicationForm`, `auth/ForgotPasswordForm`, `auth/LoginForm`,
`auth/RegisterForm`, `auth/ResendVerificationButton`, `auth/ResetPasswordForm`,
`catalogue/CatalogueBrowser`, `course/CourseDetailView`, `course/DemoPlayer`, `course/EnrollPanel`,
`dashboard/StudentDashboard`, `teacher/CourseDetailsForm`.

The split between `admin.ts` and `admin-money.ts`, and between `teacher.ts` and `earnings.ts`, has
no clear rule.

**W2. Form schemas live in four places.**

- `lib/forms/*` (the intended home).
- `lib/api/quiz-builder.ts` (`quizSettingsForm`, `questionForm`).
- Wrapper validators in components: `validateRegistration` (`auth/RegisterForm.tsx`),
  `validateDetails`, `initialValues`, `detailsBody` (`teacher/CourseDetailsForm.tsx`).
- `validateProofForm` and its types in `lib/order-display.ts`.

**W3. The async helper exists but is admin-only.** `useMutation`, `MutationStatus` and
`ReasonAction` are in `components/admin/kit.tsx`. About 20 student and teacher components write
their own `busy` / `error` / `try…catch…finally` (`ProfileEditor` alone does it three times;
also `CourseOverview`, `OutlineEditor`, `QuizPanel`, `QuizBuilder`, `VideoPanel`,
`ResourcesPanel`, `LoginForm`, `MfaSetup`…). `teacher/ConfirmButton.tsx` re-implements
`ReasonAction`.

**W4. Formatting helpers are spread over four files.**

| Helper                      | Copies                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `formatDateTime`            | `lib/order-display.ts`, `components/admin/kit.tsx`                                                                   |
| Major → minor money parsing | `lib/money.ts` (`parseMajorToMinor`), `lib/admin/format.ts` (`parseSignedMajorToMinor`, `parsePositiveMajorToMinor`) |
| Date only                   | `lib/format.ts` (`formatDate`), `lib/admin/format.ts` (`todayIso`)                                                   |

**W5. Transitional re-export.** `lib/api/types.ts` only re-exports types from `lib/api/schemas/`;
its header still describes the zod migration.

**W6. Repeated CSS.** Identical rule bodies across CSS modules:

| Rule                                                                       | Copies |
| -------------------------------------------------------------------------- | ------ |
| `font-size: var(--text-sm); color: var(--color-text-muted)`                | 10     |
| `display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2)` | 10     |
| Mono eyebrow label (mono, 2xs, tracking, uppercase, muted)                 | 5      |
| `display: flex; flex-direction: column; gap: …`                            | 7      |

`styles/globals.css` already has `.muted`, `.stack`, `.eyebrow`, `.mono`.

### Design system (Exam Hall)

Every frontend change in this plan must leave the app closer to the Exam Hall design system
(`web/src/styles/tokens.css` and the design-system README: one blue, paper/sand grounds,
signals as tint + words, shadow not borders, serif headings, mono for codes, money and counts,
inline stroke SVG icons). Already conformant: tokens are used everywhere except one spot (D6);
buttons (danger is outlined, never filled); compact density on teacher and admin; every table goes
through `ui/Table` with right-aligned `numeric` money columns; focus ring on every control; MFA
pill and count badges in the staff bar. Drift found:

**D1. Status tones disagree with the design system and with each other.** There are three tone
tables, and the same status gets different colours depending on the screen:

| Status                     | Design system | `ui/Data.tsx` | `lib/course-status.ts` | `lib/order-display.ts` |
| -------------------------- | ------------- | ------------- | ---------------------- | ---------------------- |
| Course `PENDING_APPROVAL`  | info          | **warning**   | info                   | –                      |
| Course `ARCHIVED`          | neutral       | neutral       | **warning**            | –                      |
| Order `PENDING` (awaiting) | warning       | **info**      | –                      | warning                |
| Order `PROOF_SUBMITTED`    | info          | **warning**   | –                      | info                   |
| Order `LAPSED` / `EXPIRED` | danger        | **neutral**   | –                      | **neutral**            |
| Order `REFUNDED`           | neutral       | **danger**    | –                      | neutral                |

Fix: one `lib/status.ts` with a tone and a label per domain (`course`, `order`, `account`,
`application`, `payout`), used by `StatusBadge`, the course list and the order screens. Delete
the other two tables.

**D2. No icon component; glyphs and emoji stand in.** The design system allows only inline stroke
SVGs (24px grid, `currentColor`, stroke 2, `aria-hidden`). Found: `LessonOutline.tsx` (`✓ ○ 🔒`),
`QuizTimer.tsx` (`⏱`), `ui/Field.tsx` (`⚠`), `ui/MarkSheet.tsx` and `CourseOverview.tsx`
(`✓ ✗`), `admin/screens/CoursesScreen.tsx` (`✓ !`), `CatalogueBrowser.tsx` (`▲ ▼ ← →`),
`CourseDetailView.tsx` (`▶`), `CoursePlayer.tsx`, `OrderDetail.tsx`, `ReceiptView.tsx` (`← →`),
`OutlineEditor.tsx` and `QuizBuilder.tsx` (`↑ ↓`). About 20 places.
Fix: `components/ui/Icon.tsx` with the dozen icons actually needed (check, cross, lock, circle,
clock, alert, play, arrow left/right/up/down, chevron); replace every glyph.

**D3. Money bypasses `<Money>`.** 37 `formatMoney(...)` calls render money as plain text in 11
files (admin finance, payout run, verification, cart, order detail, orders list, payment
instructions, receipt, earnings); only 5 files use `<Money>`. The design system says money is
always mono with two decimals. Fix: render money only through `<Money>`; keep `formatMoney` for
strings (emails, `aria-label`, CSV). Table headers should also name the currency when a table has
a single one (`Amount (PKR)`).

**D4. Quiz timer chip.** `Quiz.module.css .timer` uses `radius-pill` and the timer shows `⏱`. The
design system's timer is a `radius-sm` warning chip in mono with no glyph (pill is for chips
only). Fix the radius and use the clock icon from D2.

**D5. Borders where the design system wants elevation or an attention fieldset.**
`account/Mfa.module.css .codes` (recovery codes box) and `teacher/Teacher.module.css .fieldset`
draw card borders. Codes: `shadow-md` card on `surface`. Fieldset: the design system's attention
fieldset (`highlight-subtle` ground, no border) when it asks the teacher to look again, otherwise a
plain `Section`.

**D6. Raw colour.** `SiteHeader.module.css` uses `rgb(251 252 254 / 0.94)` for the sticky header.
Use `color-mix(in srgb, var(--color-surface) 94%, transparent)`. (The white logo grid in
`chrome/Chrome.module.css` is the sanctioned exception.)

**D7. `shadow-lg` is for the one focused panel.** It is also used for catalogue card hover and
focus (`Catalogue.module.css`). Cards on a grid should lift to `shadow-md` at most; keep
`shadow-lg` for the auth card, the payment instructions card and `Page .raised`.

**D8. Eyebrow style copied into 12 CSS modules.** The mono uppercase label (font, size, tracking,
transform, colour) is redefined for `dt`, stat labels, table headers, badges and brand tags. Fix:
one `.eyebrow` in `globals.css` (already there) plus `composes: eyebrow from global` or a shared
`--eyebrow` font shorthand; delete the copies. Folds into W6.

**D9. Sort order is not stated.** The design system puts the sort order in the list's eyebrow
("newest first"). Only the audit log does. Add it to the order, course, user, application,
payout and verification lists, and the student's orders and dashboard.

**D10. Unused token.** `--space-0` is defined and never used; delete it.

### Folder and file names

| Today                                                                                   | Problem                                                          |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `components/SiteHeader.tsx`, `RoleNav`, `AccountMenu`, `MfaBanner`, `VerifyEmailBanner` | Loose in `components/`; `chrome/` holds the footer and staff bar |
| `components/Captcha.tsx`                                                                | A form field, loose in `components/`                             |
| `components/forms/`                                                                     | Holds only `Form.module.css`                                     |
| `components/apply/`                                                                     | One file; the page is under `app/(auth)`                         |
| `components/teacher/PublicProfile.tsx`                                                  | Student-facing page among the teacher's own screens              |
| `lib/admin/*` beside `lib/*`                                                            | Second helper root for one audience                              |
| `lib/api/admin-money.ts`                                                                | Name does not say what is in it                                  |

### Workspace and repository

| Item                                                                   | Status                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `Claude outputs/` (repo root)                                          | Empty, untracked                                        |
| `.claude/`                                                             | Untracked: preview config and leftover worktree folders |
| `dist/`                                                                | Local build, gitignored (harmless)                      |
| `docs/backlog/` (`import_backlog.py`, CSV, README)                     | One-off GitHub import, already run                      |
| `docs/PRISMA_SETUP.md`                                                 | Historical setup log; overlaps `DATABASE_SCHEMA.md`     |
| `scripts/schema-doc.mjs`                                               | Regenerates `DATABASE_SCHEMA.md` but has no npm script  |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` (root) | Covered by `typescript-eslint`                          |

## Plan

### Phase 1: workspace (no code risk)

- [x] Delete `Claude outputs/` and the leftover `.claude/worktrees/`; add `.claude/` to `.gitignore`.
- [x] Delete `docs/backlog/` (GitHub holds the backlog), or move it to `docs/archive/`.
- [x] Trim `docs/PRISMA_SETUP.md` to the rules that are still true and rename it
      `docs/DATABASE_RULES.md` (the generated `DATABASE_SCHEMA.md` cannot hold hand-written text).
- [x] Add `"db:schema-doc": "node scripts/schema-doc.mjs"` to `package.json`.
- [x] Remove `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser`.

### Phase 2: backend duplicates

- [x] New `src/common/money.ts`: `currencyExponent`, `formatAmount`. Orders and payouts import it;
      delete `formatPayoutMoney`. Add a test for a 0- and 3-decimal payout email.
- [x] New `src/common/schemas.ts`: `uuidParams('courseId', 'lessonId')` and
      `paging({ max, default })`. Replace the 28 param and 10 paging copies.
- [x] Use `z.strictObject` for every query and body schema; leave params as they are.
      (Exception: `rosterQuerySchema` stays lenient because the web roster filter sends a `status`
      the API ignores; that filter is dead and is removed in phase 3.)

### Phase 3: web consistency

- [ ] One API style: an exported object per backend area, all through `lib/api/client.ts`:
      `auth`, `catalogue`, `enrollment`, `orders`, `learn`, `teacher`, `profile`, `earnings`,
      `quiz`, `admin`, `adminFinance`. Rename `admin-money.ts` → `admin-finance.ts`.
- [ ] Components stop calling `api.*` directly (the 13 files in W1).
- [ ] Every form schema in `lib/forms/` (`quiz.ts` added); delete the wrapper validators in W2.
- [ ] Move `useMutation` to `lib/use-mutation.ts`, `MutationStatus` and `ReasonAction` to
      `components/ui`; rewrite the components in W3; delete `ConfirmButton`.
- [ ] Dates in `lib/format.ts`, money in `lib/money.ts`; delete the duplicates in W4 and
      `lib/api/types.ts` (import from `lib/api/schemas`).
- [ ] Add `.cluster` and `.hint` to `globals.css`; remove the repeated rules in W6.

### Phase 3b: design-system conformance

Done after phase 3, on the same rules: every screen touched is checked in the browser at 380px and
desktop, on the student ground and on the staff (sand, compact) ground.

- [ ] D1: `lib/status.ts`, one tone and label table per domain, matching the design system;
      delete the tables in `ui/Data.tsx`, `lib/course-status.ts` and `lib/order-display.ts`.
- [ ] D2: `components/ui/Icon.tsx` (inline stroke SVGs); replace every glyph and emoji.
- [ ] D3: money only through `<Money>`; currency in single-currency table headers.
- [ ] D4: timer chip `radius-sm`, warning tone, mono, clock icon.
- [ ] D5: recovery codes as a `shadow-md` card; teacher fieldset as an attention fieldset.
- [ ] D6: header background from `--color-surface` via `color-mix`.
- [ ] D7: catalogue card hover at `shadow-md`.
- [ ] D8: one eyebrow style; delete the 12 copies.
- [ ] D9: sort order in every list's eyebrow.
- [ ] D10: delete `--space-0`.
- [ ] Update `ComponentShowcase` so it shows `Icon`, every status tone and `<Money>`, and
      `docs/UI_PLAN.md` so it points at the design-system rules.

**Rule for new frontend code** (add to `web/README.md`): colours, spacing, radii and shadows come
from tokens only; statuses through `StatusBadge`; money through `<Money>`; icons through `Icon`;
tables through `ui/Table`; pages start with `PageHeader` (eyebrow + serif title).

### Phase 4: folders and names (mechanical moves)

- [ ] `components/chrome/`: `SiteHeader`, `RoleNav`, `AccountMenu`, `MfaBanner`,
      `VerifyEmailBanner`, `SiteFooter`, `StaffBar`, `BrandMark`.
- [ ] `components/forms/`: `Captcha`, `Form.module.css`.
- [ ] `components/apply/` → `components/onboarding/` (or merge into `auth/`).
- [ ] `components/teacher/PublicProfile.*` → `components/teachers/` (student-facing).
- [ ] Fold `lib/admin/*` into `lib/` (`access`, `verification`, `profile-lines`).
- [ ] Update `docs/BACKEND_STRUCTURE.md`, `web/README.md` and `docs/UI_PLAN.md`.

## Target layout

```text
src/
  common/
    money.ts            currency exponents and formatting (new)
    schemas.ts          uuidParams, paging (new)
  modules/<area>/       unchanged: controllers, dao, domain, schemas, services

web/src/
  components/
    chrome/             header, nav, banners, footer, staff bar
    forms/              Captcha, form styles
    ui/                 primitives + MutationStatus, ReasonAction, Pager
    teachers/           public teacher page
    teacher/            the teacher's own screens
    admin/              admin shell and screens
    …                   auth, onboarding, catalogue, course, learn, quiz, orders, dashboard, account, home
  lib/
    api/                client, schemas/, one module per backend area
    forms/              every form schema
    format.ts money.ts  one home for each kind of helper
    use-api.ts use-mutation.ts use-zod-form.ts
```

## Risk and verification

| Phase | Risk   | How it is checked                                                           |
| ----- | ------ | --------------------------------------------------------------------------- |
| 1     | None   | CI green                                                                    |
| 2     | Low    | Unit and e2e tests; new money tests                                         |
| 3     | Medium | ~35 files; unit tests, `next build`, browser pass over every touched screen |
| 3b    | Low    | Visual only; screenshots at 380px and desktop, before and after             |
| 4     | Low    | Moves only; typecheck and build catch every broken import                   |

Phases 1, 2 and 4 are independent. Phase 4 is easiest after phase 3, which moves some of the
same files.
