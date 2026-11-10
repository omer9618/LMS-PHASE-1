# Web UI plan: the Exam Hall design

How the Next.js app in `web/` moves from its neutral placeholder look to the Exam Hall design, and what it needs to be type-safe at the API boundary. The backend (`src/`, `prisma/`) is not touched by any phase.

| Source        | Where                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Design system | Exam Hall (Claude Design System artifact): tokens, type, components, usage rules            |
| Screens       | LMS System Design canvas: 7 original screens plus 9 new ones and a screen map of all routes |
| Token names   | `web/src/styles/tokens.css`; the design system uses the same names, so values swap 1:1      |

## Rules for every phase

- **Tokens, not values.** Colours, sizes, radii and shadows come from `tokens.css`. A CSS module never hard-codes a hex value.
- **One component, many screens.** A pattern used in two places goes in `components/ui` (generic) or a feature folder's shared file (feature-only). Feature CSS modules hold layout only.
- **The API contract is checked, not assumed.** Responses are parsed with zod schemas in `lib/api/schemas/`; the TypeScript types are inferred from those schemas (`z.infer`). A response that does not match fails loudly as `BAD_RESPONSE` instead of rendering `undefined`.
- **Narrow screens and accessibility stay green.** 380px without horizontal scroll (`tokens.test.ts`), real labels, focus rings, text contrast 4.5:1.
- **Behaviour does not change in a reskin PR.** Existing tests must pass unchanged, apart from class or markup assertions a visual change makes stale.

## Phases

### 0. Foundation reskin

- `tokens.css`: Exam Hall values under the existing names, plus the new tokens the design needs (`--font-serif`, highlight colours, the staff bar colours, three elevations).
- Fonts: Source Serif 4, Source Sans 3 and JetBrains Mono through `next/font/google` (self-hosted at build, no runtime request to Google).
- `globals.css`: serif blue headings, mono figures, sand ground in staff areas.
- Restyle the primitives in `components/ui`: Button, Badge, Alert, Field, Table.
- Promote the admin-only helpers that every area needs (`PageHeader`, `Section`, `Facts`, `Money`, `StatusBadge`, `Loadable`) into `components/ui` (the write helpers `MutationStatus` and `ReasonAction` followed in the cleanup; `useMutation` is `lib/use-mutation.ts`). Add `Card` and `StatTile`/`StatGrid`.
- Headers: the light site header and the dark staff bar for the teacher and admin areas.

### 1. Zod at the API boundary

- `zod` is a dependency of `web/`, pinned to the API's version (4.6.7).
- Every client verb takes a schema as its second argument: `api.get(path, schema, query?, signal?)`, `api.post(path, schema, body?)`. The result is typed from the schema, and a response that does not match rejects with `RequestError('BAD_RESPONSE')` (the zod issues are in `error.info` and logged). The form without a schema stays only for calls that ignore the response body, and for areas not moved yet.
- Schemas live in `lib/api/schemas/<area>.ts`; types are `z.infer`-ed from them and re-exported from the area modules (`orders.ts`, `learn.ts`, `admin.ts`); components that need only a type import it from `lib/api/schemas/<area>`. Shared building blocks are in `schemas/common.ts`: minor-units money, ISO dates, IDs, pages, and `openEnum` for values the API may add.
- Objects strip unknown keys, so the API can add fields without breaking the app.

| Area                                                        | Status                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Auth, session, MFA                                          | Done (checked against live API)                                      |
| Catalogue, reference data, course detail, playback          | Done (checked against live API)                                      |
| Student enrollments, cart, orders                           | Done (checked against live API)                                      |
| Player and quiz taking                                      | Done (outline, content, completion checked live; quiz by unit tests) |
| Teacher authoring, roster, earnings, profiles, quiz builder | Done (checked against live API)                                      |
| Admin                                                       | Done (checked against live API)                                      |
| Forms validating with the same schemas before sending       | With each area's screens                                             |

### 2. Public and student screens

Home, catalogue, course detail, sign in and register, cart, order and payment, receipt, My learning, quiz workbench. The first four already have designs; the rest reuse the same parts.

### 3. Teacher screens

My courses, course details, content editor, quiz builder (new route `/teacher/courses/:id/quiz/:lessonId`), roster, earnings and payouts, profile editor.

### 4. Admin screens

Dashboard, payment verification, course review, applications, teachers, payout run and concerns, finance, enrollments, users, audit log, settings.

### 5. Hardening

A visual check of every route at 380px and 1440px, an axe accessibility pass, and removal of any CSS no screen uses any more.

## Definition of done for each PR

`npm run lint`, `typecheck`, `test` and `build` pass in `web/`; root CI is untouched; the PR lists the screens it changed with before/after notes.

## Screen status

Every route uses the Exam Hall tokens and shared components (`PageHeader`, `Section`, `SplitLayout`, `StatTile`, `Pager`). The rows below name the screens that were rebuilt; the rest were restyled and given page headers.

| Screen                                          | State                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Home (`/`)                                      | New landing page: hero with mark scheme, how buying works, practice, teach with us; site footer |
| Catalogue, course detail                        | Restyled: graph-paper course header, paper cards, mono codes and prices                         |
| Student: My learning                            | Progress tiles                                                                                  |
| Teacher: My courses, Earnings, Content editor   | Status tiles and next step; balance tiles and split layout; sand section heads                  |
| Teacher: Quiz builder                           | New: `/teacher/courses/:id/quiz/:lessonId`                                                      |
| Admin: Dashboard, Payment verification          | Queue tiles with actions; queue table beside the review panel                                   |
| Admin: Course review                            | Checklist, content and details beside the decision and pricing panel                            |
| Admin: Payout run                               | New: `/admin/payouts`, who is owed what, linking to each teacher's statement                    |
| Auth, cart, order, receipt, roster, admin lists | Rebuilt: step bar, split layouts, page headers, finance tiles, shared pager                     |
| Everything else                                 | Takes the tokens and shared components                                                          |

Forms validated with zod (`lib/forms/`): sign in, MFA code, registration, password reset, teacher application, course details, payment proof, teacher profile, quiz rules and questions. Admin reason dialogs and settings keep their own small checks.

The payout run loads each teacher's statement because the API has no single "all balances" route; add one if the teacher count grows past a few dozen.
