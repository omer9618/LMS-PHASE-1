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
- Promote the admin-only helpers that every area needs (`PageHeader`, `Section`, `Facts`, `Money`, `StatusBadge`, `Loadable`) from `components/admin/kit.tsx` into `components/ui`. Add `Card` and `StatTile`/`StatGrid`.
- Headers: the light site header and the dark staff bar for the teacher and admin areas.

### 1. Zod at the API boundary

- Add `zod` to `web/package.json`, pinned to the API's major version.
- `createApiClient` takes an optional schema: `api.get(path, { schema })` returns `z.infer<typeof schema>` and turns a mismatch into `ApiError('BAD_RESPONSE')`.
- Move the hand-written interfaces in `lib/api/types.ts` and the per-area modules to schemas in `lib/api/schemas/<area>.ts` (auth, catalogue, orders, learn, teacher, earnings, admin), one area per PR. Shared building blocks live in `schemas/common.ts`: money as a minor-units string, ISO dates, IDs, pagination.
- Forms validate with the same schemas before sending, and show field errors from zod issues.

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
