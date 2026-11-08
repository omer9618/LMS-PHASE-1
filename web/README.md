# LMS web app

The student, teacher and admin web app for LMS Phase 1. Next.js (App Router) + React + TypeScript (strict), in its own npm package: installing or building it never touches the API's dependencies.

## Run it against the API locally

The API runs on **:3000** and the web app on **:3001**, matching `APP_PUBLIC_URL=http://localhost:3001` in the API's `.env.example` (links in emails, such as verify-email and reset-password, point there).

```bash
# Terminal 1: the API (repo root). See the root README for the database setup.
npm run start:dev                 # http://localhost:3000

# Terminal 2: the web app
cd web
npm ci
npm run dev                       # http://localhost:3001
```

Open http://localhost:3001. Dev accounts are listed in the root README; register a student at `/register`. With `EMAIL_TRANSPORT=log` the API prints emails (with their links) to its console, so you can follow verify-email and reset-password links from there.

### How the browser reaches the API

The browser only talks to the web app's origin. `next.config.ts` rewrites `/api/*` to the API (`API_URL`, default `http://localhost:3000`), so:

- the API's HTTP-only session cookie is first-party on the web origin, and no CORS is needed;
- client code calls `/api/auth/me`, `/api/catalogue/courses`, and so on, through `src/lib/api/client.ts`.

| Variable                         | Default                 | Read when                                                                                                                                                                  |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`                        | `http://localhost:3000` | `next dev`, `next build` and `next start` load `next.config.ts`                                                                                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | unset                   | Build time. Set it in production (with the API's `CAPTCHA_PROVIDER=turnstile`); unset, public forms send a placeholder token that only the API's disabled verifier accepts |

Behind the proxy every request reaches the API from the web server, so set the API's `TRUST_PROXY_HOPS` to the number of proxies in front of it (1 for the web app alone; 2 with a reverse proxy in front of the web app too). Otherwise per-IP rate limits see one IP for everybody.

## Pages

| Route                                                    | What                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/courses`                                               | Catalogue: search, filters (subject, board, level, pacing, free only, price range), sort; all in the URL                                            |
| `/courses/:courseId`                                     | Course detail: syllabus coverage, pricing, teacher, demo player, free enrollment                                                                    |
| `/login`, `/register`                                    | Sign in (with the MFA step for admins), student registration (guardian details optional)                                                            |
| `/verify-email?token=`                                   | Email verification link target                                                                                                                      |
| `/forgot-password`, `/reset-password?token=[&welcome=1]` | Password reset; `welcome=1` is the first-password link for staff accounts an admin creates                                                          |
| `/teach-with-us`                                         | Public teacher application with CV upload and the human check (#18, #19)                                                                            |
| `/account/mfa`                                           | Two-step verification set-up (QR code, confirm, recovery codes shown once) and recovery-code replacement (#16)                                      |
| `/dashboard`                                             | A student's courses with completion (#52)                                                                                                           |
| `/teacher/courses`, `/teacher/courses/new`               | A teacher's courses; create a course (#24)                                                                                                          |
| `/teacher/courses/:id`                                   | Details (read-only once submitted), status and rejection reason, submit for review with the checklist, enrollment toggle, archive, delete (#25–#33) |
| `/teacher/courses/:id/content`                           | Sections and lessons with move up/down, free preview, TUS video upload straight to the video host, PDF files (#27, #34–#38)                         |
| `/teacher/courses/:id/enrollments`                       | The course's students, view only (#50)                                                                                                              |
| `/teacher/earnings`                                      | Balance, pending vs confirmed sales, statement, payouts and payout concerns (#79–#88)                                                               |
| `/dev/components`                                        | Every primitive in both densities (development only; 404 in production builds)                                                                      |

## Narrow screens (#45)

Every page is built mobile-first and must work at **380px** wide without horizontal scrolling.

- `src/styles/tokens.test.ts` fails if any stylesheet sets a `width`, `min-width`, `flex-basis` or grid track wider than 380px outside a media query.
- Checked by eye and by measurement in Chrome with a 380px device viewport (DevTools device toolbar, or CDP `Emulation.setDeviceMetricsOverride`): `/courses`, `/courses?free=true&q=…`, a course detail page with a long title, `/login` and `/register` all have `scrollWidth` 380. Plain `chrome --headless --window-size=380,…` is not a valid check: headless windows have a minimum width of about 500px, so screenshots look clipped.

## Commands

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Dev server on :3001                                        |
| `npm run build`        | Production build (`npm start` serves it on :3001)          |
| `npm test`             | Unit and component tests (Vitest + Testing Library, jsdom) |
| `npm run lint`         | ESLint (`eslint-config-next` + TypeScript rules)           |
| `npm run typecheck`    | `tsc --noEmit`                                             |
| `npm run format:check` | Prettier (same rules as the API)                           |

CI runs all of them in the `web` job of `.github/workflows/ci.yml`.

## Layout

| Path                                                                 | What                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/app/`                                                           | Routes (App Router)                                                        |
| `src/components/ui/`                                                 | Base primitives: Button, Input/Select/Checkbox, Badge, Table, Alert        |
| `src/styles/tokens.css`                                              | Design tokens: colour, type, spacing, density                              |
| `src/lib/api/`                                                       | Typed fetch client, error type, response shapes                            |
| `src/lib/money.ts`                                                   | Money formatting and parsing with string maths (minor units, never floats) |
| `src/lib/catalogue-url.ts`                                           | Catalogue filter state in the URL (#42)                                    |
| `src/app/learn/[courseId]`                                           | Course player (#53) and quiz taking (#75); `?lesson=` selects the lesson   |
| `src/components/learn/`, `src/components/quiz/`                      | Player, outline, video (watch reporting), LaTeX `MathText`, quiz screens   |
| `src/lib/api/learn.ts`                                               | Typed learner API: outline, content, playback, watch, completion, quizzes  |
| `src/app/cart`, `src/app/orders`                                     | Cart and checkout (#54, #55), my orders, proof upload, receipt (#58–#62)   |
| `src/components/orders/`, `src/lib/cart.ts`, `src/lib/api/orders.ts` | Purchase screens; the cart in localStorage; typed orders API               |

Tests sit next to the code as `*.test.ts(x)` (not `*.spec.ts`, which the API's Jest would pick up).

## Conventions

- **Styling: CSS Modules plus one global tokens file**, no Tailwind. The tokens are CSS custom properties, so density is switched by a `data-density` attribute at runtime with no extra build step or class juggling, components stay plain CSS any developer can read, and there is no extra dependency to keep current.
- **Density:** `comfortable` (default, students and teachers) or `compact` (admin). Set `data-density="compact"` on a layout element; only the density tokens change. See `/dev/components` in development for every primitive in both densities.
- **API errors** are `ApiError` instances with the API's `name` (e.g. `INVALID_CREDENTIALS`), `message` and `info`. `fieldErrors(error)` maps validation errors onto form fields.
- **Money** is a string of minor units, as in the API. Format with `formatMoney` / `formatPrice`; parse what people type with `parseMajorToMinor`. Never `Number()` or `parseFloat` an amount.
- **Accessibility:** every control has a label; errors are linked with `aria-describedby` and marked `aria-invalid`; focus is always visible; colour pairs meet WCAG 2.2 AA (checked in `src/styles/tokens.test.ts`).
- **Dependencies** are pinned exactly. `.npmrc` sets `legacy-peer-deps` because npm 10 crashes resolving vite 8's optional peer chain; every needed peer is listed in `package.json`.
