# Paperlane web — UI/UX review

**Date:** 11 Nov 2026
**Branch reviewed:** `fix/qa-review-findings` at `2badb51`. Production build of `/web` against the local API, using seeded QA data.
**Measured against:**

- The Exam Hall design system (DS):
  - colours: paper `#FBFCFE`, sand `#F4F3EE`, ink `#14213D`, blue `#1F3A93`, highlighter `#FFE066`, success `#1E6B45`, danger `#B3261E`
  - type: Source Serif 4, Source Sans 3, JetBrains Mono
  - layout: 16px grid, shadows not borders, 4/8px radii, 380px minimum
- The 7 Exam Hall mockups (`LMS Exam Hall UI.html`).
- The 43-route screen map.

**Scope:**

- Every route as guest, student (with data and fresh), teacher (with data and empty), and admin, at 1440, 768 and 380px.
- Plus scripted checks of forms, validation, pending, loading and error states, dialogs, keyboard flow and axe.

**No app code was changed in this pass.**

Screenshot paths are relative to this file:

- `ui-review/shots/<role>/<screen>@<width>.jpg`: one per route, role and width (≈300 files).
- `ui-review/shots/states/<name>.jpg`: interaction states.

Priorities:

|        | Meaning                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- |
| **P0** | Can cause irreversible or public damage, or blocks a core task. Fix before release.                  |
| **P1** | A core flow is confusing, broken on a supported width, or fails WCAG 2.2 AA in a way users will hit. |
| **P2** | Clear inconsistency with the DS, a missing state, or friction on a common path.                      |
| **P3** | Polish: copy, alignment, minor token drift.                                                          |

---

## Fix status (branch `fix/ui-ux-review`)

The review pass above changed no app code. The fixes came after, in `fix/ui-ux-review`. This table
says what each finding became. Most were fixed; the rest are listed with the reason.

**Fixed:** A-1, A-2, A-3, A-8, A-9, A-10, A-11, A-12, O-1, O-3, O-4, L-1, L-2, L-3, Q-1, Q-2, Q-3, C-1,
C-3, CT-1, T-1, T-2, T-3, T-7, T-9, T-11, T-13, AU-1, AU-3, AU-4, AU-6, G-1, G-2, G-4, G-5, G-6,
G-8, G-10, G-13, G-14, G-16, K-2, K-4, K-6, quick wins 1–14, and duplicates D-a, D-b, D-c, D-e, D-f,
D-j.

**Partly fixed:**

| ID                   | Done                                                                                                               | Left                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A-1                  | Approval asks first, states the saved price or "free", lists open checklist items; pricing sits above the decision | Approve is not blocked while the pricing form has unsaved edits                                                     |
| A-4                  | Lesson titles link to the staff preview                                                                            | "Details" and "Edit details" still duplicate each other                                                             |
| A-5                  | One wording for waits ("199d 3h")                                                                                  | Card-in-card in "Today"                                                                                             |
| A-6                  | Filters no longer stretch to the full row                                                                          | Pager still has no count                                                                                            |
| G-3                  | One shared `SignInGate` and `Forbidden` page everywhere                                                            | No middleware redirect to `/login?next=` (the `proxy` convention changed in this Next version; not attempted blind) |
| G-7                  | Footer, skip link, breadcrumb, tabs, checkbox rows and compact buttons now reach 36px (44px on phones)             | Admin QA-reference links; compact inputs are 36px on desktop by design                                              |
| G-9                  | Payout periods, queue ages and deadlines share one format                                                          | Native date inputs still show mm/dd/yyyy (the browser's locale)                                                     |
| G-12                 | Confirm/reason forms return focus; forgot-password success takes focus                                             | Not every async swap                                                                                                |
| O-2                  | Progress steps, "Pay by" chip, amount prefilled, one raised panel                                                  | No order-summary column                                                                                             |
| O-5                  | Receipt number in the eyebrow, "Billed to" on two lines, card centred                                              | No transaction ID or seller details (needs API fields)                                                              |
| D-1                  | Default sort is "Continue first"; no "Active" chip noise; "Show 7 more"                                            | No "Next: lesson" line (the API does not send the next lesson's title)                                              |
| L-4                  | My learning link, completion button beside Next                                                                    | Outline panel still scrolls inside its own column                                                                   |
| T-6, T-8, T-10, T-12 | Newest-first and paged lists, empty states with a button, price wording, progress bars                             | Card layout for tables at 380px; Details column still repeats API text                                              |
| AU-8                 | File inputs styled; unlocked from native look                                                                      | Not prefilled from the signed-in student                                                                            |
| CA-1, CA-2           | Results row aligned, card text in Sans, "(PKR)" on the price range                                                 | Active-filter chips and "Clear all"                                                                                 |
| Q-4                  | Quiz heading removed, "uses an attempt" line, selected-option bar                                                  | Question card still has its ring (it is the control's boundary)                                                     |
| K-1                  | Total rule, empty states                                                                                           | Option borders kept: they are the 3:1 boundary of a control (WCAG 1.4.11)                                           |
| K-3                  | `code` text stays on the type scale; KaTeX errors use the danger colour                                            | Hero headline size                                                                                                  |
| ACC-1                | Current device first, five at a time, no loopback IPs                                                              | —                                                                                                                   |
| D-d                  | See G-3                                                                                                            |                                                                                                                     |
| D-h                  | File inputs share one style                                                                                        | No shared `FileInput` component                                                                                     |

**Not changed:** G-15 (single staff bar), A-7, A-14, AU-2 (show-password), AU-5, AU-7, H-1, C-2,
TP-1, ACC-2, K-5 (token renames), D-g, D-i. These are layout redesigns or small polish that
deserve their own change.

**Corrections to this review** (found while fixing):

- **A-3:** I suggested prefilling the amount received from the student's claim. The code leaves it
  empty on purpose, so that checking a transfer is not clicking through. That stays. The order
  lookup also cannot find an order by its reference: the API has no such search, so it now
  says so instead of failing.
- **A-5:** the yellow queue badges are the design system's "count" use of the highlighter, not a
  warning. Left as is.
- **CT-2 / G-3:** a guest with items in the cart already sees "N courses in your cart" and a
  Sign-in button. My crawl had an empty cart.
- **ACC-2:** the header name already links to the account page.
- **C-1:** "Free preview" on a text lesson was a chip with nothing behind it (only video lessons
  have a demo player). The chip is gone; video demos keep their button.
- **A-9:** the payout page sits under "Payout run", which is the right section.
- **G-11:** the wordmark link already has the accessible name "Paperlane".

New in the fixes: the API now refuses to save bank-transfer instructions that still contain
`[to be confirmed]` (`settings.rules.ts`), and the free-course cart error says "Enrol".

---

## Quick wins

Each of these is small (minutes to an hour) and high-value.

1. **Put a confirmation on the three one-click actions**, using the `ConfirmButton` and `ReasonAction` components that already exist in `components/ui/Mutation.tsx`:
   - Approve and publish: `components/admin/screens/CoursesScreen.tsx:250`
   - Application Reject and Hire: `components/admin/screens/ApplicationsScreen.tsx:205`
   - Teacher Unpublish: `components/teacher/ProfileEditor.tsx:150`

   → A-1, A-2, T-9

2. **Fix the Content-tab section header gap.** In `components/teacher/Outline.module.css:32`, split the shared `.sectionHead, .sectionTitle { flex: 1 1 14rem }` rule so that `.sectionHead` gets `flex: none`. This removes the ~150px empty band above every section. → T-1
3. **Replace `window.confirm`** for section and lesson delete (`components/teacher/OutlineEditor.tsx:182`, `:356`) with `ConfirmButton variant="danger"`. → T-2
4. **Collapse the course outline by default below 60rem** in the player, so the lesson is the first thing on a phone instead of being ~2,300px down. → L-1
5. **Show "Paid out PKR 12,500.00", not "PKR -12,500.00"** on teacher earnings. → T-7
6. **Make the numeric quiz hint conditional.** "A number only; the unit is shown for you." currently shows when there is no unit (`components/quiz/QuizAttempt.tsx:318`). → Q-2
7. **Delete the login eyebrow "Step 1 for everyone · step 2 for admins"** (`components/auth/LoginForm.tsx:167`). → AU-1
8. **Default "My learning" to the existing "Continue first" sort** instead of "Recently enrolled". → D-1
9. **Add `role="status"` to `CopyButton`** so "Copied" is announced. → G-13
10. **Clear the "Pick the bank value date." error** when the admin switches the decision to Reject. → A-3
11. **Add a "Continue learning" button** to the enrol card when the viewer is enrolled. → C-1
12. **Name the course in the cart 409 message** and list the cart items under it. → CT-1
13. **Pin the footer**: `body { display:flex; flex-direction:column; min-height:100dvh }` and `main { flex:1 }`. → G-5
14. **One `STATUS_LABELS` map** next to `STATUS_TONES` in `lib/status.ts`. This ends PAID / CONFIRMED / PAYMENT CONFIRMED and PENDING APPROVAL / IN REVIEW. → G-8

---

## Ranked index

| ID         | P      | Screen                 | Finding                                                                                                              |
| ---------- | ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A-1        | **P0** | Admin · course review  | "Approve and publish" publishes on one click, and publishes as **Free** when pricing wasn't saved                    |
| A-2        | **P0** | Admin · application    | "Reject" (and "Hire") act on one click with no reason or confirmation                                                |
| O-1        | **P1** | Order · pending        | Students are shown "[to be confirmed]" bank details and asked to pay                                                 |
| L-1        | **P1** | Learn · 380px          | Lesson content starts ~2,300–3,000px down because the outline is open first                                          |
| C-1        | **P1** | Course · enrolled      | No "Continue learning" from the course page; free-preview lessons can't be opened                                    |
| CT-1       | **P1** | Cart · 409             | "This is a free course…" error doesn't say which course, and cart items aren't shown                                 |
| D-1        | **P1** | My learning            | No "continue where you left off" (mockup hero); default sort buries in-progress courses                              |
| T-1        | **P1** | Teacher · content      | ~150px empty band in every section header                                                                            |
| T-7        | **P1** | Teacher · earnings     | "PAID OUT PKR -12,500.00"                                                                                            |
| A-3        | **P1** | Admin · verification   | Decision form reads as a toggle, keeps stale errors, has no CLAIMED or TXN ID columns, and lookup rejects references |
| G-1        | P2     | Global · loading       | Plain-text loading states; the player's sits at x=0 and collapses the page; no `loading.tsx`                         |
| G-3        | P2     | Global · gates         | Seven separately built sign-in gates in four looks; no middleware redirect                                           |
| G-2        | P2     | Global · errors        | Four different error renderings; some have no retry or way back; raw "Request validation failed"; no `error.tsx`     |
| G-4        | P2     | Global · 403           | Forbidden is a small callout pinned top-left, with no heading and no way back                                        |
| G-5        | P2     | Global · shell         | Footer not pinned; ~48px paper strip above the footer on sand pages                                                  |
| G-6        | P2     | Global · titles        | Non-unique `<title>`s (WCAG 2.4.2)                                                                                   |
| G-7        | P2     | Global · targets       | Many targets under 44px (footer links 20px, compact buttons 28px, checkboxes 20px)                                   |
| G-8        | P2     | Global · status        | Same state, different words across roles                                                                             |
| G-9        | P2     | Global · time          | Five duration formats; ISO dates; mm/dd/yyyy inputs                                                                  |
| G-12       | P2     | Global · focus         | Focus drops to `<body>` after async success                                                                          |
| G-14       | P2     | Global · header        | Sign in / Create account stay visible on auth pages; no active state                                                 |
| G-15       | P2     | Staff shell            | Double navigation (public AppBar plus staff bar or side nav), misaligned containers                                  |
| G-16       | P2     | Admin · 380px          | Side nav stacks ~300px above every admin page                                                                        |
| O-2        | P2     | Order · pending        | Missing the mockup's stepper, deadline, amount prefill and summary column                                            |
| O-3        | P2     | Order · pending        | "How to pay" panel off-token; reference instruction duplicated                                                       |
| Q-1        | P2     | Quiz                   | A timed attempt isn't a focused mode: outline and lesson links stay live                                             |
| Q-2        | P2     | Quiz                   | "Unit is shown for you" with no unit                                                                                 |
| L-2        | P2     | Learn                  | Unlock reason repeated on every locked row and read twice by screen readers                                          |
| L-3        | P2     | Learn                  | Previous/next links lead to locked lessons                                                                           |
| T-2        | P2     | Teacher · content      | Native `confirm()`; Delete not danger-styled; 28px toolbar targets                                                   |
| T-3        | P2     | Teacher · draft        | Destructive trigger not danger-styled; red ✕ checklist before any attempt; no % unit                                 |
| T-6        | P2     | Teacher · courses      | No sort eyebrow, unpaged, sideways scroll at 380, empty state has no CTA                                             |
| T-8        | P2     | Teacher · earnings     | Ledger oldest-first, 11,659px tall and unpaged; ISO dates; "a few days"                                              |
| T-9        | P2     | Teacher · profile      | Unpublish acts on one click                                                                                          |
| T-12       | P2     | Teacher · pending      | "Price Free" contradicts "the admin will set the price"; duplicated message                                          |
| T-13       | P2     | Teacher · quiz builder | Two breadcrumbs, two h1s, no active tab                                                                              |
| A-4        | P2     | Admin · course review  | Lessons can't be previewed; Details and Edit details duplicate each other                                            |
| A-5        | P2     | Admin · dashboard      | "4779h 10m"; badges always yellow                                                                                    |
| A-9        | P2     | Admin · payout         | Wrong column label; three words for one state; wrong nav highlight                                                   |
| A-10       | P2     | Admin · application    | Three ways to hire; linking needs a raw user ID                                                                      |
| A-11       | P2     | Admin · user           | Suspend reason and Send password reset look like one control; Remove allowed on the last role                        |
| A-12       | P2     | Admin · settings       | Raw keys as titles, no units, no client validation                                                                   |
| ACC-1      | P2     | Account                | Raw `::1` IPs; 12 unpaged sessions                                                                                   |
| AU-1       | P2     | Login                  | "Step 1 for everyone · step 2 for admins"                                                                            |
| AU-3       | P2     | MFA step               | Different header style; code input not narrow or mono                                                                |
| AU-6       | P2     | Verify / reset         | No-token page says "invalid or expired"                                                                              |
| AU-8       | P2     | Teach with us          | Native file input; not prefilled for signed-in users                                                                 |
| C-3        | P2     | Course 404             | Generic "Page not found"                                                                                             |
| K-1…K-6    | P2–P3  | Tokens                 | Borders instead of shadows, hardcoded sizes, token name drift (see the Tokens section)                               |
| _the rest_ | P3     |                        | Polish: listed per screen below                                                                                      |

---

## Findings by screen

### Global and shell

#### G-1 · Loading states are bare text, and the player's breaks the layout (P2)

- **Route:** all data screens. Clearest on `/learn/:courseId`, `/dashboard`, `/courses`, `/teacher/courses` and `/admin/verification`.
- **Screenshots:**
  - `ui-review/shots/states/learn-loading.jpg`
  - `states/dashboard-loading.jpg`
  - `states/catalogue-loading.jpg`
  - `states/teacher-courses-loading.jpg`
  - `states/admin-dashboard-loading.jpg`
- **What's wrong:**
  - Loading is a single line ("Loading your courses…", "Loading courses…").
  - The player's "Loading course…" (`components/learn/CoursePlayer.tsx:95`) renders outside the page container at x=0. The page then collapses, so the footer jumps up to y≈560 and back down when data lands.
  - There is no `app/**/loading.tsx` anywhere, so route transitions show nothing.
- **Why it matters:** layout shift (CLS) and a "broken page" first impression on slow mobile connections, the main audience.
- **Fix:**
  - Add a `Skeleton` primitive in `components/ui` (sand `--color-surface` blocks, radius-sm, no shimmer when `prefers-reduced-motion`).
  - Give each screen a skeleton that matches its final layout (card list, table rows, player two-column).
  - In `CoursePlayer.tsx:95`, render the loading state inside the same `Page` container as the loaded state.
  - Add `loading.tsx` in `app/(site)`, `app/teacher` and `app/admin` that render the skeleton shell.

#### G-2 · Error states are inconsistent, some are dead ends, and there's no error boundary (P2)

- **Routes:**
  - `/orders`
  - `/orders/:id`
  - `/learn/:id`
  - `/admin/orders/:id` (the order lookup)
  - every route, for render errors
- **Screenshots:**
  - `states/orders-error.jpg`
  - `states/order-error.jpg`
  - `states/learn-error.jpg`
  - `states/order-lookup-bad.jpg`
  - compare with the good examples `states/dashboard-error.jpg`, `states/catalogue-error.jpg` and `states/teacher-courses-error.jpg`
- **What's wrong:**
  - The dashboard, catalogue and teacher screens show a titled danger callout with "Try again" (good).
  - `/orders` shows an untitled one-line callout with no retry.
  - `/learn` has no retry and no link back to My learning.
  - The admin order lookup surfaces the API's "Request validation failed".
  - No `error.tsx` exists, so an uncaught render error shows Next's default page.
- **Why it matters:** users stranded on a failure have no next step. Raw API messages read as bugs.
- **Fix:**
  - Extract the dashboard pattern into `components/ui/LoadError.tsx`, with `title`, `message`, `onRetry` and an optional `backHref`/`backLabel`, and use it on every query screen.
  - Map API error codes to human copy in `lib/api/client.ts`. For example, a validation error on `/admin/orders/:id` becomes "That isn't an order ID. Paste the full ID or search by reference."
  - Add `app/error.tsx`, `app/teacher/error.tsx` and `app/admin/error.tsx` rendering `LoadError` with `reset`.

#### G-3 · Four different sign-in gates (P2)

- **Routes:**
  - `/cart` shows "Your cart is empty" to a guest.
  - `/dashboard`, `/account` and `/teacher` show an h1 plus an inline "Sign in" link.
  - `/admin` shows a small callout pinned top-left, with no h1.
- **Screenshots:**
  - `ui-review/shots/guest/cart-guest@1440.jpg`
  - `guest/dashboard-guest@1440.jpg`
  - `guest/account-guest@1440.jpg`
  - `guest/teacher-guest@1440.jpg`
  - `guest/admin-guest@1440.jpg`
- **What's wrong:**
  - Every gate correctly links to `/login?next=<path>`, and `LoginForm` honours `next`.
  - But each gate is built separately (`StudentDashboard.tsx:130`, `AccountSettings.tsx:40`, `TeacherGuard.tsx:25`, `AdminShell.tsx:196`, `CartView.tsx:74`, `OrdersList.tsx:25`, `CoursePlayer.tsx:271`), and they look different.
  - Every protected page costs the user an extra click.
  - The guest cart says "empty" even when the local cart has items.
- **Why it matters:**
  - The same situation looks like four different products.
  - The cart message is simply untrue.
- **Fix:**
  - In `middleware.ts`, redirect unauthenticated requests for `/dashboard`, `/orders/*`, `/account/*`, `/learn/*`, `/teacher/*` and `/admin/*` straight to `/login?next=<path>`.
  - Delete the seven inline gates; keep one shared `SignInGate` only for client-side session expiry.
  - The cart lists local items, with "Sign in to check out".

#### G-4 · Forbidden pages are a pinned callout (P2)

- **Routes:** `/admin` and `/teacher` as a student.
- **Screenshots:** `student/admin-forbidden@1440.jpg`, `student/teacher-forbidden@1440.jpg`
- **What's wrong:** a yellow callout at top-left (24px), outside the page container. There is no h1 and no way back.
- **Why it matters:** looks like a crash. Screen-reader users get no heading to land on.
- **Fix:** add a `Forbidden` component (or `app/forbidden.tsx`), rendered inside `Page`:
  - h1 "You don't have access to this area"
  - a line naming the signed-in account
  - buttons "Go to My learning" and "Sign in with another account"

#### G-5 · Footer not pinned; paper strip above the footer on sand pages (P2)

- **Routes:**
  - Short pages: `/cart`, `/orders`, `/orders/:id/receipt`, `/404` and the guest gates.
  - Sand pages: the auth pages, `/account/mfa`, and every teacher and admin page.
- **Screenshots:**
  - `guest/login@1440.jpg` (the strip under the sand area)
  - `student/cart@1440.jpg` (blank paper under the footer)
  - `states/forgot-sent.jpg`
- **What's wrong:**
  - The ground colour is painted on an inner wrapper whose height is a magic number (`app/(auth)/auth.module.css:5`, `min-height: calc(100vh - 9rem)`), so a ~48px paper strip shows between the sand and the footer.
  - On short pages the footer floats mid-screen.
- **Fix:**
  - `body { min-height: 100dvh; display: flex; flex-direction: column; }`, with the content wrapper getting `flex: 1`.
  - Paint the ground on that wrapper (or `body[data-ground="sand"]`) rather than a fixed-height inner block.
  - Drop the `calc(100vh - 9rem)`.

#### G-6 · Page titles are not unique (P2, WCAG 2.4.2)

- **Routes and titles:**

  | Route                                                      | Current `<title>`      | Problem                                 |
  | ---------------------------------------------------------- | ---------------------- | --------------------------------------- |
  | `/teacher/courses/:id`, `/content`, `/roster`, `/quiz/:id` | "Teaching · Paperlane" | All share one title                     |
  | `/orders/:id`                                              | "Order · Paperlane"    | Generic                                 |
  | `/learn/:id`                                               | "Course player"        | Generic                                 |
  | `/admin/payouts/:id`                                       | h1 is "Payout"         | Doesn't identify the payout             |
  | guest `/admin`                                             |                        | Title doesn't match the visible heading |

- **Why it matters:** browser tabs, history and screen-reader page announcements can't tell these pages apart.
- **Fix:** `generateMetadata` per route in the form "\<object\> · \<section\> · Paperlane". Examples:
  - "Economics (YEC11) · Content · Teaching · Paperlane"
  - "Order QA-005341 · Paperlane"
  - "Topic 1.2 · Economics (YEC11) · Paperlane"
  - "Payout · QA Teacher 1 · Oct 2026 · Admin"

#### G-7 · Touch targets under 44px (P2)

Measured at 380px.

| Element                                             | Size    | Where                                                      |
| --------------------------------------------------- | ------- | ---------------------------------------------------------- |
| Footer links                                        | 150×20  | every page                                                 |
| Skip link                                           | 38 tall | every page                                                 |
| Breadcrumb links                                    | 14 tall | course, teacher and admin detail pages                     |
| Course tabs (Overview / Content / Roster)           | 36      | teacher course pages                                       |
| Compact buttons, including content-toolbar move ↑/↓ | 34×28   | teacher content                                            |
| Staff inputs                                        | 36      | teacher and admin                                          |
| Checkboxes                                          | 20×20   | catalogue "Free courses only", quiz builder, admin pricing |
| Account "Sign out", MFA button                      | 36      | account                                                    |
| Admin nav links                                     | 28      | admin                                                      |
| Teacher brand link                                  | 28      | teacher                                                    |
| QA reference links in the admin statement           | 39×37   | admin statement                                            |

- **Why it matters:**
  - The brief asks for 44px.
  - WCAG 2.2 AA (2.5.8) only requires 24px, so the 20px checkboxes and 14px breadcrumbs fail even AA unless spaced.
  - Students are mostly on phones.
- **Fix:**
  - Add `--target-min: 2.75rem` to `tokens.css` and use it for every `min-height: 2.75rem` already in the codebase (see K-2).
  - Footer and breadcrumb links: `display:inline-flex; min-height:var(--target-min); align-items:center`.
  - Checkboxes: keep the 20px box, but make the whole `<label>` the 44px hit area.
  - Compact (staff) buttons: the DS minimum is 36px. Raise `size="sm"` from 28 to 36, and to 44 below 48rem.

#### G-8 · One state, many words (P2)

- **What's wrong:**
  - **Orders:** the list chip says **PAID**, the DS says **CONFIRMED**, and the receipt says **PAYMENT CONFIRMED**.
  - **Course review:** the admin says **PENDING APPROVAL**, the teacher sees **IN REVIEW**.
  - **Payout disputes:** **DISPUTED** on the payout, **CONCERN RAISED** elsewhere, the nav says "Payout concerns".
- **Root cause:**
  - `lib/status.ts` centralises _tones_ only.
  - Admin screens print `humanize(enum)` (for example `CoursesScreen.tsx:69, 149`).
  - The teacher area has its own `lib/teacher/course-status.ts`.
- **Screenshots:**
  - `student/orders@1440.jpg`
  - `student/receipt@1440.jpg`
  - `admin/course-review@1440.jpg`
  - `teacher/course-pending@1440.jpg`
  - `admin/payout-detail@1440.jpg`
- **Fix:**
  - Add `STATUS_LABELS` beside `STATUS_TONES` in `lib/status.ts`, with the DS vocabulary:
    - orders: Awaiting payment · Proof submitted · Confirmed · Rejected · Expired
    - courses: Draft · In review · Published · Rejected · Archived
    - disputes: Concern raised · Resolved
  - Make one `<StatusChip status>` the only way to render a status. Delete `humanize()` for statuses and the teacher map.

#### G-9 · Durations and dates in five formats (P2)

- **What's wrong:**

  | Shown                      | Where                                      |
  | -------------------------- | ------------------------------------------ |
  | "Oldest 4779h 10m"         | admin dashboard                            |
  | "199 d 3 h"                | verification stat tile                     |
  | "198 d 3 h"                | verification rows                          |
  | "(in 1 day 18 h)"          | pending order                              |
  | "under an hour"            | concerns, set in mono                      |
  | "2026-10-01 to 2026-10-31" | payout rows                                |
  | "11 Nov 2026, 14:15 GMT+5" | user detail                                |
  | mm/dd/yyyy                 | native date inputs (verification, finance) |

  The DS rule is concrete hours and minutes: "51h 10m".

- **Fix:**
  - One `formatDuration(ms)` in `lib/format.ts`, used everywhere:
    - < 1 h → "42m"
    - < 72 h → "51h 10m"
    - otherwise → "8d 3h"
  - One `formatDate`: "26 Apr 2026"; with time "26 Apr 2026, 14:15".
  - One `formatPeriod`: "1–31 Oct 2026".
  - For date inputs, show the chosen date formatted next to the input ("Sun 26 Apr 2026") and default it to today. Chrome formats `type=date` by browser locale, so the label alone can't fix it.

#### G-10 · "Enroll" and "Enrol" both used (P3)

- **What's wrong:**
  - "Sign in to enroll for free", "Enroll for free", "Enrollment" and "enrollments" (course detail, teacher draft, admin nav "Enrollments").
  - "ENROLMENT" elsewhere.
- **Fix:** British spelling throughout, since the audience is Cambridge/Pakistan: Enrol, Enrolment, Enrolments.

#### G-11 · Brand casing (P3)

- **What's wrong:** "paperlane" in the header wordmark; "Paperlane" in the footer and titles.
- **Fix:** if lowercase is the logo, keep it visually but make the link's accessible name "Paperlane home". Use "Paperlane" in all text.

#### G-12 · Focus is dropped after async success (P2, WCAG 2.4.3)

- **What's wrong:** after these actions, `document.activeElement` is `<body>`:
  - forgot-password "Check your email" (`states/forgot-sent.jpg`)
  - application reject
  - course approve
  - the admin order lookup
  - "Sign out all other devices"
- **Why it matters:** keyboard and screen-reader users lose their place and don't hear the result.
- **Fix:** after a state swap, focus the new heading or result `Alert` (`tabIndex={-1}` plus `ref.focus()`). Put that in `useMutation`'s success path so every screen gets it.

#### G-13 · "Copied" isn't announced (P3)

- **Route:** `/orders/:id` → "Copy reference"
- **Screenshot:** `states/copy-reference.jpg`
- **What's wrong:** the label changes to "Copied" (good), but there's no live region.
- **Fix:** in `CopyButton`, render a visually hidden `<span role="status">` that receives "Reference copied".

#### G-14 · Header during the sign-in flow (P2)

- **Routes:** `/login`, `/register`, `/forgot-password`
- **Screenshot:** `guest/login@1440.jpg`
- **What's wrong:**
  - "Sign in" and "Create account" stay in the header on their own pages, with no active state.
  - "Sign in" is the only underlined nav item.
  - At 380, the "Menu" button hides both auth links, so the main conversion action is behind a tap.
- **Fix:**
  - Hide the auth pair on auth routes, or mark the current one with `aria-current="page"` and the active style.
  - Remove the underline.
  - At 380, keep "Sign in" visible beside Menu. The DS says no hamburger below 8 links, and guests have 4.

#### G-15 · Staff shell: double navigation, misaligned container (P2)

- **Routes:** `/teacher/*`, `/admin/*`
- **Screenshots:**
  - `teacher/courses@1440.jpg`
  - `admin/dashboard@1440.jpg`
  - compare with mockup board "Admin · payment verification"
- **What's wrong:**
  - **Teacher:** the public AppBar (Courses / My teaching / My orders / Cart) sits above a dark staff bar ("Teaching | Courses Earnings Profile") with a second logo.
  - **Admin:** AppBar plus a dark side nav, with the ADMIN pill shown twice.
  - Staff content starts at x=24, while the AppBar content starts at x=104.
- **Why it matters:** two competing navigation layers, and the eye has to re-find the left edge.
- **Fix:**
  - In `app/teacher/layout.tsx` and `app/admin/layout.tsx`, replace `SiteHeader` with one 56px staff bar: logo, section links, user menu with "Student view" and "Sign out", and "MFA verified" for admin, as in the mockup.
  - Use one container (`max-width: 90rem; padding-inline: var(--space-6)`) for both bar and content.

#### G-16 · Admin side nav at 380px (P2)

- **Route:** every `/admin/*` page
- **Screenshot:** `admin/verification@380.jpg`
- **What's wrong:** the side nav stacks ~300px above every page. Tables (enrolments, orders, payouts) then scroll sideways.
- **Fix:**
  - Below 64rem, render the nav as a `<details>` "Admin menu · Payment verification" collapsed by default (or a horizontally scrolling tab strip).
  - Render DataTables as stacked cards below 48rem: label/value pairs, primary column as the card title.

---

### Auth: `/login`, MFA, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`

What works:

- Required fields have `aria-invalid` and described errors.
- `autocomplete` is correct (`email`, `current-password`, `new-password`, `name`).
- The pending state "Signing in…" disables the button.
- Wrong password shows a `role=alert` "Invalid email or password".
- Tab order is logical: skip link → nav → email → password → Sign in → Forgot → Create.

#### AU-1 · Confusing eyebrow on Sign in (P2)

- **Route:** `/login`
- **Screenshot:** `guest/login@1440.jpg`
- **What's wrong:** "STEP 1 FOR EVERYONE · STEP 2 FOR ADMINS" (`components/auth/LoginForm.tsx:167`).
- **Why it matters:** students don't know what step 2 is, and it advertises the admin flow.
- **Fix:** remove it. If an eyebrow is wanted, use "Welcome back".

#### AU-2 · No show-password control (P3)

- **Routes:** `/login`, `/register`, `/reset-password`, `/account`
- **Fix:** add a "Show" toggle button inside the password `Field` (`aria-pressed`, `aria-controls`).

#### AU-3 · MFA step looks like a different product (P2)

- **Route:** `/login` (step 2)
- **Screenshot:** `admin/login-mfa-step@1440.jpg`
- **What's wrong:**
  - A dark band header unlike step 1.
  - A green ADMIN pill; green means success in the DS.
  - The 6-digit input is full-width Sans.
- **Fix:**
  - Same card as step 1, with eyebrow "Two-step verification".
  - Code input: `width: 10ch`, JetBrains Mono, `inputmode="numeric"`, `pattern="[0-9]*"`, `maxlength=6`. Keep `autocomplete="one-time-code"`.
  - Neutral or info tone for the role pill.

#### AU-4 · Register form details (P3)

- **Route:** `/register`
- **Screenshots:** `states/register-empty.jpg`, `states/register-bad.jpg`
- **What's wrong:**
  - The "Parent or guardian (optional)" `<fieldset>` has the browser default border.
  - On error, the password shows both the hint "At least 10 characters. A short phrase works well." and the error "Use at least 10 characters".
- **Fix:**
  - Add a global `fieldset { border:0; padding:0; margin:0 }` reset, and give the legend the h3 style.
  - Replace the hint with the error when invalid, as `QuizAttempt` already does.

#### AU-5 · Pages without a card heading pattern (P3)

- **Routes:** `/reset-password` and `/verify-email` with no or bad token
- **What's wrong:** no eyebrow, and the error callouts use a 1px border.
- **Fix:** same card and eyebrow as the other auth pages. Alert tone background only (see K-1).

#### AU-6 · "Invalid or expired" when there was no token at all (P2)

- **Route:** `/verify-email`
- **Screenshot:** `guest/verify-email-no-token@1440.jpg`
- **Fix:** with no token, say "Open the link we emailed you to verify your address." and add a "Resend the email" button for signed-in users. Keep "invalid or expired" for a bad token only.

#### AU-7 · Vague expiry (P3)

- **Route:** `/forgot-password` after submit
- **Screenshot:** `states/forgot-sent.jpg`
- **What's wrong:** "The link expires soon, so use it shortly."
- **Fix:** state the real TTL from the API config, for example "The link works for 60 minutes."

#### AU-8 · Teach with us (P2)

- **Route:** `/teach-with-us`
- **Screenshots:** `guest/teach-with-us@1440.jpg`, `states/teach-empty.jpg`, `student/teach-with-us@1440.jpg`
- **What's wrong:**
  - Native unstyled "Choose File" input. The same applies on payment proof and the teacher photo.
  - "Human check disabled in this environment." is visible (`components/ui/Captcha.tsx:92`); fine in dev, but make sure it can't render in production.
  - A signed-in student gets no prefilled name or email.
- **Fix:**
  - One `FileInput` component: a dashed dropzone with icon, file name, size and remove, per the order mockup. Use it in all three places.
  - Prefill from the session.
  - Render the captcha notice only when `NODE_ENV !== 'production'`.

---

### Home `/`

#### H-1 · Polish (P3)

- **Screenshots:** `guest/home@1440.jpg`, `guest/home@380.jpg`
- **What's wrong:**
  - A blank strip above the footer.
  - The eyebrow uses success green decoratively; the DS reserves green for status.
  - At 380 the two hero CTAs have unequal widths.
  - The showcase "answer box" looks like an input that does nothing on click.
- **Fix:**
  - Eyebrow in `--color-text-muted`.
  - Hero CTAs `flex: 1 1 100%` below 48rem.
  - Give the showcase answer a sand fill with no inset border, so it reads as a figure.

---

### Catalogue `/courses`

What works: the error state, with a titled callout and "Try again".

#### CA-1 · Results header and filters (P2)

- **Screenshots:** `guest/catalogue@1440.jpg`, `guest/catalogue-search-empty@1440.jpg`, mockup board "Catalogue"
- **What's wrong:**
  - The result count and the "Sort by" control sit on different baselines.
  - There are no active-filter chips and no "Clear all"; the mockup has both.
  - The price range has no currency ("Min", "Max").
  - The pager repeats.
- **Fix:**
  - One results row, matching the mockup: "**6 courses** for Physics (5054) · Cambridge O Level" on the left, Sort on the right, `align-items: baseline`.
  - Active-filter chips with × above the results, plus "Clear all" in the filter card header.
  - Label "Price range (PKR)".
  - Show the pager once, below the results.

#### CA-2 · Course card typography (P3)

- **What's wrong:**
  - The subject chip repeats the start of the title.
  - Teacher names are set in mono; the DS reserves mono for codes, money and IDs.
- **Fix:**
  - Chips show board · code · level (`CAIE · 5054 · O LEVEL`) as in the mockup.
  - Teacher name in Sans with an initials avatar.

---

### Course detail `/courses/:id`

#### C-1 · Enrolled students can't continue from here; previews can't be opened (P1)

- **Screenshots:**
  - `student/course-enrolled@1440.jpg`
  - `student/course-not-enrolled@1440.jpg`
  - `guest/course-detail@1440.jpg`
- **What's wrong:**
  - For an enrolled student the enrol card says "Free · You are enrolled" with no button.
  - Syllabus rows aren't links.
  - The FREE PREVIEW chip still shows to enrolled students.
  - For guests, the free-preview lesson isn't clickable either, so "free preview" can't be previewed. The mockup puts a playable preview at the top: "2 of 24 lessons are free to watch".
- **Why it matters:** the course page is the second most visited student page, and it's a dead end for enrolled students and a conversion gap for guests.
- **Fix:**
  - Enrolled: the primary button "Continue learning" → `/learn/:id?lesson=<currentLessonId>`, plus a progress line.
  - Syllabus rows link to the lesson when enrolled.
  - Preview rows link to the preview player for everyone.
  - Hide the FREE PREVIEW chip when enrolled.

#### C-2 · Visual polish (P3)

- **What's wrong:**
  - Large mono "Free".
  - Thin enrol card.
  - Sand syllabus rows inside a card, each repeating "Reading".
  - The teacher name in two different fonts.
- **Fix:**
  - "Free" in Serif h2 size; the DS uses mono only for numeric money.
  - Show the lesson type as a small icon, and only when the course mixes types.

#### C-3 · Course 404 is generic (P2)

- **Screenshot:** `guest/course-detail-404@1440.jpg`
- **What's wrong:** "Page not found", with a link styled as a link.
- **Fix:** add `app/courses/[courseId]/not-found.tsx` with:
  - h1 "Course not found"
  - "It may have been unpublished or the link is mistyped."
  - a search field
  - a primary button "Browse courses"

---

### Teacher public page `/teachers/:id`

#### TP-1 · Polish (P3)

- **Screenshot:** `guest/teacher-public@1440.jpg`
- **What's wrong:**
  - The "Teachers" breadcrumb isn't a link, and there's no teachers index.
  - Card-in-card.
  - The teacher name is repeated.
- **Fix:**
  - Breadcrumb "Courses / \<Teacher name\>".
  - One raised card.
  - Name once, as the h1.

---

### Cart `/cart`

#### CT-1 · 409 state hides the problem (P1)

- **Screenshot:** `student/cart@1440.jpg`
- **What's wrong:**
  - Checkout fails with "This is a free course. Enroll directly without checkout." and a "Remove that course" button.
  - The message doesn't name the course, and the cart lines aren't rendered at all, so the student can't see what they're removing.
- **Why it matters:** a student can't check out and doesn't know why.
- **Fix:**
  - Always render the cart lines.
  - Mark the offending line inline: "Free course — enrol from the course page", with links "Enrol now" and "Remove".
  - Stop free courses from being added to the cart (`AddToCart` should render "Enrol for free" for `isFree`).

#### CT-2 · Guest cart says "empty" (P3)

- **Screenshot:** `guest/cart-guest@1440.jpg`
- **Fix:** covered by G-3. A guest's localStorage cart should still list its items, with "Sign in to check out".

---

### Orders: `/orders`, `/orders/:id`, receipt

What works:

- "Copy reference" copies (clipboard verified: `QA-005341`) and relabels to "Copied".
- The payment-proof form validates with described errors.

#### O-1 · Placeholder bank details shown to students (P1)

- **Route:** `/orders/:id` (awaiting payment)
- **Screenshots:** `student/order-pending@1440.jpg`, `admin/settings@1440.jpg` (`BANK_TRANSFER_INSTRUCTIONS`)
- **What's wrong:** "How to pay" shows "Bank: [to be confirmed]" and "Account title: [to be confirmed]", and still asks the student to transfer money.
- **Why it matters:** a student can't pay, or pays the wrong account. Money is at stake.
- **Fix:**
  - In Settings, reject a `BANK_TRANSFER_INSTRUCTIONS` value containing `[to be confirmed]` or an empty account number.
  - On the order page, if instructions are missing, show a blocked state: "Payment details aren't available yet. We'll email you when they are." No reference block.
  - Show an admin dashboard warning tile.

#### O-2 · Pending order is missing the mockup's structure (P2)

- **Screenshots:** `student/order-pending@1440.jpg`, mockup board "Order and payment"
- **What's wrong:**
  - No 4-step progress (Order placed → Pay and upload proof → We verify → Lessons unlock).
  - No deadline chip; the list card for an awaiting-payment order shows no deadline either.
  - "I have paid" sits below the fold in the right column while the left column is empty.
  - The amount isn't prefilled.
  - The course title isn't a link.
- **Fix:** follow board 4:
  - The stepper at the top.
  - Left column: "1. Transfer the amount", with the amount in a sand tile and the reference in a highlighter tile with Copy; then "2. Upload your payment proof", with the amount prefilled from the order total.
  - Right column: "Order summary".
  - A "Pay by Tue 10 Nov, 14:00" chip on both the page and the list card.

#### O-3 · "How to pay" styling and copy (P2)

- **What's wrong:**
  - A 2px border instead of `--shadow-lg`.
  - "Put the reference in the note" appears twice.
  - "(in 1 day 18 h)" breaks the time rule.
- **Fix:**
  - `box-shadow: var(--shadow-lg)`, no border. This is the one lg panel on the page.
  - Keep the reference instruction once, beside the reference.
  - Use `formatDuration` (G-9): "42h 10m left".

#### O-4 · Two back-link styles (P3)

- **What's wrong:** "← MY ORDERS" is mono uppercase with an underlined leading space; the receipt uses "← Back to the order".
- **Fix:** one `BackLink` component: Sans, sentence case, icon outside the underline.

#### O-5 · Verified order and receipt (P3)

- **Screenshots:** `student/order-verified@1440.jpg`, `student/receipt@1440.jpg`
- **What's wrong:**
  - Verified order: the right third of the page is empty, and the chip says "PAID" (G-8).
  - Receipt: "No. RCT-07203" floats off the h1 baseline. "Billed to" runs on with a comma. The card is left-aligned at 640px. There's no transaction ID and no seller details.
- **Fix:**
  - Receipt number as an eyebrow above the h1.
  - "Billed to" as a definition list.
  - Centre the receipt card.
  - Add the bank transaction ID, verification date and the platform's legal name and address.

---

### My learning `/dashboard`

What works: the error state, with a title and "Try again".

#### D-1 · No "continue where you left off" (P1)

- **Screenshots:** `student/dashboard@1440.jpg`, mockup board "My learning"
- **What's wrong:**
  - The mockup opens with a "Continue" card naming the next lesson or quiz, with a primary CTA. The app has none.
  - The default sort is "Recently enrolled", so an in-progress course can sit below untouched ones. A "Continue first" option exists but isn't the default.
  - Cards have no "Next: …" line.
- **Why it matters:** resuming is the single most common student action.
- **Fix:**
  - Default the sort to "Continue first".
  - Add the hero card from `outline.currentLessonId` of the most recently studied course.
  - Add "Next: \<lesson\>" plus a "Continue" button on each card.

#### D-2 · Card details (P3)

- **What's wrong:**
  - Cards and stat tiles have a 1px border plus a shadow.
  - The subject is repeated under the title.
  - "Find more courses" aligns to the subtitle, not the h1.
  - "Show more (7 more)".
- **Fix:**
  - Shadow only.
  - Board · code · level eyebrow instead of the repeated subject.
  - `PageHeader` actions aligned to the h1 (`align-items: start`).
  - "Show 7 more".

---

### Learn player `/learn/:courseId`

#### L-1 · Content is ~2,300–3,000px down on phones (P1)

- **Screenshots:** `states/quiz-380.jpg`, `student/learn@380.jpg`
- **What's wrong:** "Course outline" is an open `<details>` rendered before the lesson. Measured at 380, the quiz heading starts at **y = 2,264px**.
- **Fix:**
  - Render `open` only at ≥60rem.
  - Below that, collapse it and show the summary "Course outline · 5 of 21 done".
  - Or put the outline after the lesson with CSS `order`.

#### L-2 · Lock reason repeated on every row and read twice (P2)

- **Screenshot:** `states/quiz-attempt.jpg` (left column)
- **What's wrong:**
  - Every locked row shows 'Complete "Practice quiz: supply and demand" to unlock this lesson' in olive text.
  - Each locked row button is 99px tall.
  - Its accessible name is "Topic 2.1 Reading Complete … , locked: Complete …", with the reason twice.
  - The outline uses straight quotes; the next button uses curly ones.
- **Fix:**
  - Show the reason once, at the first locked row (or as a section-level line "Locked until you pass _Practice quiz_").
  - Other locked rows: a lock icon, with accessible name "Topic 2.1, locked".
  - Use curly quotes everywhere.

#### L-3 · Previous and next link to locked lessons (P2)

- **What's wrong:** "Topic 2.1 →" is offered while the quiz is incomplete.
- **Fix:** if the next lesson is locked, replace the link with a disabled pill, "Topic 2.1 · unlocks after this quiz".

#### L-4 · Polish (P3)

- **What's wrong:**
  - "Mark as complete" is centred while next/previous sit at the edges.
  - No breadcrumb back to My learning.
  - The outline panel scrolls internally and clips its last row.
- **Fix:**
  - Put the completion action in the lesson footer row, left of "Next".
  - Add "My learning / \<course\>" above the h1.
  - Give the outline `max-height: calc(100dvh - header)` with sticky positioning, not a fixed height.

---

### Quiz (in the player)

What works:

- Clear intro (questions, time, attempts).
- Timer chip in highlighter.
- Pips announce "Question 1, answered".
- "All answers saved".
- "Review and submit" opens an inline "Submit your answers? 1 of 2 questions is not answered…" with "Keep working" / "Submit".
- Previous is disabled on Q1.

#### Q-1 · A timed attempt isn't a focused mode (P2)

- **Screenshots:** `states/quiz-attempt.jpg`, `states/quiz-submit-unanswered.jpg`, mockup board "Quiz workbench"
- **What's wrong:**
  - The course outline and the lesson previous/next ("← Topic 1.5", "Topic 2.1 →") stay on screen during a running attempt.
  - Submit only appears on the last question.
- **Why it matters:** students leave mid-attempt while the timer keeps running, and can't hand in early from Q1.
- **Fix:** per the mockup:
  - While an attempt is running, hide the outline and lesson navigation.
  - Show a top bar: "Exit", "\<Quiz\> · Attempt 1 of 3", the timer, and an always-visible "Submit attempt" that opens the existing confirmation.

#### Q-2 · Hint mentions a unit that isn't there (P2)

- **Screenshot:** `states/quiz-submit-unanswered.jpg`
- **What's wrong:** "A number only; the unit is shown for you." appears when `question.numericUnit` is empty (`components/quiz/QuizAttempt.tsx:318`).
- **Fix:** `question.numericUnit ? 'Type the number only. The unit is fixed.' : 'Type a number, such as 1.5.'` Render the unit as an input suffix box, as in the mockup.

#### Q-3 · Answered vs current pips are hard to tell apart (P3)

- **What's wrong:** answered is a faint tint (`rgb(233,237,255)`); current is a ring.
- **Fix:** follow the mockup:
  - current = solid primary with white text
  - answered = primary-subtle with primary text
  - unanswered = paper with a border-strong outline

  Add a one-line legend.

#### Q-4 · Intro and card styling (P3)

- **What's wrong:**
  - An h2 "Practice quiz: supply and demand" followed by an h3 "Quiz".
  - "Start quiz" doesn't say it uses an attempt.
  - The question card and options use 1px borders (`Quiz.module.css:149, 164, 198`).
- **Fix:**
  - Drop the "Quiz" heading.
  - Button "Start attempt 1 of 3".
  - Card: `--shadow-md`. Options: sand fill, hover primary-subtle, selected 3px inset bar (`--shadow-selected`, K-2).

---

### Account `/account`, `/account/mfa`

What works:

- Change-password validation, including "The passwords do not match".
- "Name saved." status.
- "Signed out of every other device." status.
- Email is `readOnly`.

#### ACC-1 · Sessions list (P2)

- **Screenshot:** `student/account@1440.jpg`
- **What's wrong:** raw "::1" IPs, 12 sessions unpaged, 36px Sign-out buttons.
- **Fix:**
  - Show browser and OS, "This device", "Last active 2h ago", and an approximate city instead of the IP.
  - Show 5, then "Show 7 more".
  - 44px buttons.

#### ACC-2 · Layout and wayfinding (P3)

- **What's wrong:**
  - The read-only email looks editable next to "Save name".
  - Section headers use divider borders (`Account.module.css:23`).
  - `/account/mfa` has no back link or eyebrow.
- **Fix:**
  - Email as text plus "Contact support to change it".
  - Sections as raised cards.
  - BackLink "← Account".

---

### Teacher

#### T-1 · Empty band in every Content-tab section header (P1)

- **Route:** `/teacher/courses/:id/content`
- **Screenshot:** `teacher/content@1440.jpg`
- **What's wrong:**
  - `.section` is a column flexbox.
  - `Outline.module.css:32` gives `.sectionHead` (and `.sectionTitle`) `flex: 1 1 14rem`.
  - In a column, that basis becomes a 224px height, so each header is ~150px of empty band.
- **Fix:**
  ```css
  .sectionHead {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .sectionTitle {
    flex: 1 1 14rem;
    min-width: 0;
    font-size: var(--text-lg);
  }
  ```
  Also replace `.sectionHead`'s `border-bottom` with the DS divider (sand background change only).

#### T-2 · Content-tab destructive actions (P2)

- **Screenshot:** `states/section-delete-dialog.jpg` (native dialog: "Delete "Unit 1" and its 6 lessons?")
- **What's wrong:**
  - Section and lesson delete use `window.confirm` (`OutlineEditor.tsx:182`, `:356`).
  - The section "Delete" is a ghost button, not danger.
  - The toolbar buttons are 34×28.
  - "SECTION 1:" has a trailing colon.
  - The new-lesson Type defaults to Video.
  - "Add lesson" isn't aligned with its input.
- **Fix:**
  - Use `ConfirmButton` (`components/ui/Mutation.tsx:111`) with `variant="danger"` and label "Delete…".
  - 36px minimum (44px below 48rem).
  - Default the type to Text, or no default with a required select.
  - Align the button with `align-items: end`.

#### T-3 · Course draft page (P2)

- **Route:** `/teacher/courses/:id`
- **Screenshots:** `teacher/course-draft@1440.jpg`, `states/draft-delete-dialog.jpg`, `states/draft-submit-incomplete.jpg`
- **What's wrong:**
  - "Delete course" is a neutral outline next to "Archive course". It does reveal an inline "Delete this course for good? [Delete] Cancel" (good), but the trigger isn't danger-styled, and Escape doesn't dismiss the inline confirm.
  - The submission checklist shows red ✕ before the teacher has tried anything.
  - "Proposed commission" has no % unit.
  - The breadcrumb uppercases the course title.
- **Fix:**
  - Trigger `variant="danger"`, label "Delete course…".
  - `ConfirmButton` handles `Escape` and returns focus to the trigger.
  - Checklist items start neutral (○ "To do") and turn red only after a failed submit.
  - Add a `%` suffix to the field.
  - Breadcrumb in sentence case.

#### T-6 · My courses list (P2)

- **Route:** `/teacher/courses`
- **Screenshots:** `teacher/courses@1440.jpg`, `teacher/courses@380.jpg`, `teacherEmpty/courses-empty@1440.jpg`
- **What's wrong:**
  - The eyebrow "32 COURSES" doesn't state the sort.
  - 32 rows, unpaged.
  - The meta line is set in mono.
  - The table scrolls sideways at 380.
  - Empty state: column headers with plain text "No courses yet. Create your first course." and no button, and the filter is shown with nothing to filter.
- **Fix:**
  - Eyebrow "32 courses · recently updated first".
  - Pager at 20.
  - Meta in Sans.
  - Card layout below 48rem.
  - Empty state: hide the table and filter; an `EmptyState` with the primary "New course" button.

#### T-7 · Negative "Paid out" (P1)

- **Route:** `/teacher/earnings`
- **Screenshot:** `teacher/earnings@1440.jpg`
- **What's wrong:** the stat tile reads "PAID OUT PKR -12,500.00".
- **Why it matters:** teachers read it as money taken from them.
- **Fix:** show `Math.abs`, labelled "Paid out". Keep signs only in the ledger's amount column, with "+" / "−" and colour.

#### T-8 · Earnings ledger and payouts (P2)

- **Screenshots:** `teacher/earnings@1440.jpg`, `teacherEmpty/earnings-empty@1440.jpg`
- **What's wrong:**
  - The ledger is oldest-first, with no sort eyebrow, 11,659px tall, and unpaged.
  - DETAILS repeats "Sale" on every row.
  - Payout periods are ISO ("2026-10-01 to 2026-10-31").
  - "Payouts" heading sits outside a card while "Statement" is inside one.
  - The payout card mixes Serif and mono.
  - "you have a few days to raise a concern" (the setting is 7).
  - Empty state: three empty tables, and "No entries yet." vs "None.".
  - The highlighted "OWED TO YOU" tile has a 2px primary ring though it isn't a problem number (K-4).
- **Fix:**
  - Newest first, eyebrow "Newest first", pager at 25.
  - DETAILS shows the course and student.
  - `formatPeriod` "1–31 Oct 2026".
  - Both sections as cards.
  - Interpolate `PAYOUT_DISPUTE_WINDOW_DAYS` ("7 days").
  - One empty state: "No sales yet. Earnings appear once an admin confirms a student's payment."

#### T-9 · Unpublish acts on one click (P2)

- **Route:** `/teacher/profile`
- **Screenshot:** `states/profile-unpublish-dialog.jpg` (after the click: "NOT PUBLISHED")
- **What's wrong:** "Unpublish" (`ProfileEditor.tsx:150–156`) immediately hides the teacher's public page and their name on courses. There is no confirmation.
- **Fix:**
  - `ConfirmButton` "Unpublish your profile? Students won't see it on your courses until you publish again."
  - Also: fieldsets have default borders (K-6).
  - Photo upload is two steps (native input, then "Upload"). Use `FileInput` that uploads on choose, with a preview.

#### T-10 · Roster (P3)

- **Screenshot:** `teacher/roster@1440.jpg`
- **What's wrong:**
  - "Students (38)" set small.
  - The UNTIL column is all "—".
  - Progress is % text only.
  - No search or paging.
- **Fix:**
  - h2 size.
  - Hide UNTIL when every value is empty.
  - Add `ProgressBar` next to the %.
  - Search by name or email, pager at 25.

#### T-11 · New course (P3)

- **Screenshots:** `teacher/course-new@1440.jpg`, `states/new-course-empty.jpg`
- **What's wrong:** the form isn't in a card, and fields stretch to 1,392px.
- **Fix:** raised card, `max-width: 40rem`.

#### T-12 · Pending course contradicts itself (P2)

- **Screenshot:** `teacher/course-pending@1440.jpg`
- **What's wrong:**
  - "Price: Free" next to copy saying the admin will set the price.
  - The same message appears as a banner and as a callout.
- **Fix:**
  - Show "Price: set by admin at approval" while pending.
  - Keep one message.

#### T-13 · Quiz builder (P2)

- **Screenshots:** `teacher/quiz-builder@1440.jpg`, `states/quiz-add-question.jpg`, `states/quiz-question-empty-save.jpg`
- **What's wrong:**
  - Two breadcrumbs and two h1s.
  - The h1 "Quiz builder" doesn't name the quiz.
  - No course tab is active; it should be Content.
  - Truncated question rows have no full-text affordance.
  - The pass-mark field sits beside a 20px checkpoint checkbox.
- **What works:** empty-save validation, e.g. "Write the question" and "Write the option".
- **Fix:**
  - One breadcrumb "Courses / \<course\> / Content / \<quiz\>".
  - h1 = quiz title, with eyebrow "Quiz".
  - Content tab `aria-current`.
  - Rows show two lines with `line-clamp: 2` and a `title`.
  - The checkbox label as a 44px row, with the pass mark indented under it and enabled only when checked.

---

### Admin

#### A-1 · Approve and publish: one click, and can publish as Free (P0)

- **Route:** `/admin/courses/:id`
- **Screenshots:**
  - `admin/course-review@1440.jpg`
  - `states/course-approve-dialog.jpg`
  - `states/course-pricing-paid.jpg` (the course after approval: PUBLISHED; the Free box was unticked by the test, not saved). The public page `/courses/a61dff1c…` now shows "Free".
- **What's wrong:**
  - "Approve and publish" (`CoursesScreen.tsx:250–263`) calls `approveCourse` immediately, with no confirmation.
  - Pricing is a separate form with its own "Save pricing", and "Free course" is ticked by default. An admin who approves before saving the price publishes the course **free**.
  - Approve is also enabled while the checklist shows "Needs a look".
  - **Observed in this review:** one click published "Accounting (0452) — complete course part 1170" as Free.
- **Why it matters:** irreversible public and financial consequence (students enrol free). Unpublishing later doesn't revoke those enrolments.
- **Fix:**
  - Move pricing into the decision card, so one form decides and prices.
  - The primary "Approve and publish…" opens `ConfirmButton`: "Publish at PKR 4,500.00 with 30% commission?" (or "…as a free course?").
  - Disable while the pricing form is dirty or invalid.
  - Show the "Needs a look" items in the confirmation.

#### A-2 · Application Reject and Hire act on one click (P0)

- **Route:** `/admin/applications/:id`
- **Screenshots:** `admin/application-detail@1440.jpg`, `states/application-reject-dialog.jpg` ("Application rejected.")
- **What's wrong:**
  - "Reject" (`ApplicationsScreen.tsx:205–210`) rejects immediately. There is no confirmation and no reason, despite the notes field above.
  - "Hire" is also one click.
  - Reject is placed before Hire.
  - **Observed:** one click rejected "Applicant 360".
- **Fix:**
  - `ReasonAction` for Reject (`components/ui/Mutation.tsx:28`), label "Reject…", with a reason sent to the applicant. Place it last, as a danger outline.
  - `ConfirmButton` for "Hire…".

#### A-3 · Payment verification decision form (P1)

- **Route:** `/admin/verification`
- **Screenshots:**
  - `admin/verification@1440.jpg`
  - `states/verify-record-empty.jpg`
  - `states/verify-reject-mode.jpg`
  - `states/verify-row-select.jpg`
  - `states/order-lookup-bad.jpg`
  - mockup board "Admin · payment verification"
- **What's wrong:**
  - "Confirm received" and "Reject" look like a filled/outline toggle above the fields, with "Record decision" at the bottom, so it's unclear which is selected or what will happen.
  - After a failed "Record decision", switching to Reject keeps "Pick the bank value date.", which doesn't apply to rejection.
  - "Reject payment" submits without confirmation.
  - The queue lacks the mockup's CLAIMED and TXN ID columns, so admins can't scan for amount mismatches.
  - The selected row is only a faint tint: no 3px inset bar, no `aria-selected` or `aria-current`.
  - FLAGS repeats "PAST TURNAROUND" on every row.
  - Course names truncate before the distinguishing "part N".
  - The eyebrow reads "PAST 2 D TURNAROUND".
  - "Order ID" lookup needs a UUID; typing the visible reference returns "Request validation failed".
  - The Open button is 28px beside a 36px input.
- **Why it matters:** this is the money screen. Mistakes confirm unpaid orders or reject paid ones.
- **Fix:** per the mockup:
  - **Form:**
    - A radio group "Decision": Confirm received / Ask the student to top up / Reject…
    - The primary button label follows the choice: "Confirm payment", "Request top-up" or "Reject…" (danger outline plus a reason dialog).
    - Clear errors on change.
    - Amount and value date side by side, prefilled from the claim.
  - **Queue:**
    - Add CLAIMED (danger when short) and TXN ID columns.
    - The selected row gets `--shadow-selected` and `aria-current="true"`.
    - Show FLAGS only for exceptions (Amount short, Txn ID used before).
    - Eyebrow "Past 48h turnaround".
  - **Lookup:** accept a reference or a UUID ("Find order").

#### A-4 · Course review content (P2)

- **Screenshot:** `admin/course-review@1440.jpg`
- **What's wrong:**
  - Lesson titles in "Content" aren't links, so an admin can't open a lesson to review it.
  - "Details" and "Edit details" duplicate each other.
  - The chip "PENDING APPROVAL" vs the teacher's "IN REVIEW" (G-8).
- **Fix:**
  - Link each lesson to a read-only preview (`/learn/:id?lesson=…` with `viewer=ADMIN`).
  - One details card with an "Edit" toggle.

#### A-5 · Dashboard (P2)

- **Screenshot:** `admin/dashboard@1440.jpg`
- **What's wrong:**
  - "Oldest 4779h 10m".
  - Card-in-card in "Today".
  - Nav badges are always warning yellow (1529, 200, 2000).
- **Fix:**
  - `formatDuration` (G-9): "199d 3h".
  - One card level.
  - Neutral badges, turning warning only when an item is past its SLA.

#### A-6 · Courses list (P3)

- **What's wrong:** a full-width status select, a pager with no count, heavy underlining.
- **Fix:** select `width: auto`, "1–20 of 199", underline only on hover for table links.

#### A-7 · Order detail (P3)

- **What's wrong:** amount and date labels are misaligned; "(frozen at order time)" is jargon.
- **Fix:** definition-list grid; "Price when ordered".

#### A-8 · Payouts list (P3)

- **What's wrong:** "TOTAL OWED (PKR)" plus PKR in the value; the highlight ring on a non-problem tile (K-4).
- **Fix:** drop "(PKR)" from the label.

#### A-9 · Payout detail (P2)

- **Screenshot:** `admin/payout-detail@1440.jpg`
- **What's wrong:**
  - The amount column header reads "TEACHER".
  - The chip says "DISPUTED" while the nav and concerns use "Payout concerns" / "Concern raised".
  - The nav highlights "Payout run".
  - h1 "Payout".
- **Fix:**
  - "Teacher share".
  - G-8 labels.
  - Highlight the parent list.
  - h1 "Payout · QA Teacher 1 · Oct 2026".

#### A-10 · Application detail (P2)

- **What's wrong:**
  - Three ways to hire (Hire, Create teacher account, Link account).
  - Linking needs a raw user ID.
  - "Get CV link" is two steps.
- **Fix:**
  - One "Hire…" flow: search an existing account by email, or create one.
  - "Download CV" as a direct signed link.

#### A-11 · User detail (P2)

- **Screenshots:** `admin/user-detail@1440.jpg`, `states/user-suspend-dialog.jpg`, `states/user-remove-role.jpg`
- **What's wrong:**
  - "Suspend" opens an inline reason field (good), but "Send password reset" sits on the same row, so it reads as part of the suspend form.
  - "Remove" on the only role is allowed, then fails with "That did not work — An account must keep at least one role".
  - The Grant select is very wide, and the Grant button is misaligned.
- **Fix:**
  - Group "Send password reset" under its own "Access" heading.
  - Disable Remove on the last role with a hint.
  - Select `width: auto`; button `align-self: end`.

#### A-12 · Settings (P2)

- **Screenshots:** `admin/settings@1440.jpg`, `states/settings-invalid.jpg`
- **What's wrong:**
  - Cards are titled with raw keys (`VIDEO_COMPLETION_THRESHOLD_PCT`).
  - Inputs have no units.
  - `-5` is accepted client-side, then the server replies "Invalid value for VIDEO_COMPLETION_THRESHOLD_PCT".
  - Multi-line defaults run together.
- **Fix:**
  - Human titles ("Video counts as watched at").
  - Unit suffixes (%, hours, days).
  - `min`/`max` client validation with a human message ("Enter a percentage from 50 to 100").
  - Keep the key as a small mono caption for support.
  - Show `pre-wrap` for multi-line values.

#### A-13 · Finance and concerns (P3)

- **What's wrong:**
  - Stat-tile money wraps "PKR" onto its own line at 1440.
  - The "Show" button is misaligned with the date inputs.
  - mm/dd/yyyy inputs.
  - Concern age "under an hour" in mono.
- **Fix:**
  - `white-space: nowrap` on the currency and amount pair.
  - `align-items: end`.
  - G-9.
  - Sans for words.

#### A-14 · Long pages at 380 (P3)

- **What's wrong:** the admin statement, teacher statement and audit log are many screens long on phones.
- **Fix:** paginate at 25, with the stacked-card table pattern (G-16).

---

## Tokens and hardcoded values

No raw hex colours exist in CSS modules outside `tokens.css`, and only two inline styles exist (both legitimate: the icon baseline and the progress width). Good.

#### K-1 · Borders where the DS says shadows (P2)

| Where                                                                  | What                       |
| ---------------------------------------------------------------------- | -------------------------- |
| `Quiz.module.css:97, 149, 164, 198`                                    | question card and options  |
| `QuizBuilder.module.css:203, 216`                                      | builder options            |
| `Catalogue.module.css:203`                                             | dashed empty-state boxes   |
| `Dashboard.module.css:91`                                              | dashed empty-state boxes   |
| `Orders.module.css:72`                                                 | 2px ink total rule         |
| `Alert.module.css:6`                                                   | alerts drawn with a border |
| `MarkSheet.module.css:84`                                              |                            |
| `Account.module.css:23`, `Outline.module.css:29`, `Page.module.css:47` | section dividers           |

- **Fix:**
  - Cards and options: `--shadow-sm`/`--shadow-md`.
  - Empty states: sand fill.
  - Totals: weight plus spacing.
  - Alerts: tone background only.
  - Keep borders only on inputs and table rows.

#### K-2 · Hardcoded sizes that need tokens (P2)

| Value                                                   | Count                   | Where                                                                                                | New token or component                                                             |
| ------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `2.75rem` min target                                    | 6                       | `SiteHeader.module.css:136`, `Player.module.css:88, 118`, `Quiz.module.css:95, 96, 162`              | `--target-min`                                                                     |
| `1.25rem` checkbox and radio                            | 4                       | `Field.module.css:153`, `Quiz.module.css:177`, `QuizBuilder.module.css:130`, `Player.module.css:150` | `--control-check`, plus one `Checkbox`                                             |
| `1.0625rem` question text                               | 2                       | `MarkSheet.module.css:55`, `QuizBuilder.module.css:184`                                              | `--text-question` (in the DS, missing from tokens)                                 |
| `0.5rem` progress height                                | 3                       | `Dashboard.module.css:48`, `Player.module.css:65`, `Outline.module.css:121`                          | `ProgressBar` component                                                            |
| 3px inset primary bar (selected)                        | 4                       | Player ×2, Outline, QuizBuilder                                                                      | `--shadow-selected`                                                                |
| letter-spacing `0.08em`, `0.03em`, `-0.01em`, `-0.02em` |                         | Home, Player, Chrome                                                                                 | `--tracking-eyebrow`, `--tracking-tight`                                           |
| Media queries `40rem`, `48rem`, `60rem`, `64rem`        | 4 different breakpoints |                                                                                                      | Standardise on two (48rem tablet, 64rem desktop) and document them in `tokens.css` |

#### K-3 · Off-scale computed sizes (P3)

- **What's wrong:**
  - em-relative code text yields 11.96, 12.88, 13.8, 14.25, 16.56 and 25.76px (`Orders.module.css:25` `0.95em`, `MathText.module.css:32` `1.1em`).
  - The hero `clamp(2rem, 4.2vw, 3rem)` yields 32.256px at 768.
  - KaTeX errors render in its default `#cc0000`.
- **Fix:**
  - Use `var(--text-*)` steps.
  - Clamp between scale steps (`clamp(var(--text-3xl), 4vw, var(--text-4xl))`).
  - Pass `errorColor: '#B3261E'` to KaTeX.

#### K-4 · Highlight ring on non-problem stat tiles (P2)

- **What's wrong:** `Data.module.css:68` puts a 2px primary ring on "highlight" tiles: teacher "OWED TO YOU", admin "TOTAL OWED", finance "OWED TO TEACHERS". The DS says tint a StatTile only when its number is a problem.
- **Fix:** drop the ring. Use the danger or warning tint only when the value breaches a threshold (as "PAST 2 D TURNAROUND" does).

#### K-5 · Token names and values drift from the DS (P3)

| Token                            | Issue                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| `--color-bg` / `--color-surface` | Names swapped relative to the DS: paper is the surface, sand is the ground |
| Control heights                  | 36/44/52 against the DS's 36/40/44/52; compact mode is 36/28/40            |
| `--text-question`                | Missing                                                                    |
| `--color-border-strong`          | `#6d6e7b` against the DS's `#757683` (contrast is still fine; just align)  |

- **Fix:** rename via aliases first (`--color-ground`, `--color-paper`), then migrate.

#### K-6 · No fieldset reset (P3)

- **What's wrong:** register and teacher-profile fieldsets render the browser's default 2px groove border.
- **Fix:** a global reset (AU-4).

---

## Duplicated components and patterns

| #   | Pattern                      | Copies                                                                                                                               | Make it one                           |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| D-a | Progress bar                 | Dashboard, Player, Outline (each its own CSS)                                                                                        | `ui/ProgressBar`                      |
| D-b | Status label text            | `lib/status.ts` (tones), `lib/teacher/course-status.ts`, `humanize()` on admin screens, inline "PAID"                                | `STATUS_LABELS` plus `StatusChip`     |
| D-c | Confirmation                 | `ConfirmButton` / `ReasonAction`; `window.confirm` in `OutlineEditor`; nothing on Approve, application Reject or Hire, and Unpublish | `ConfirmButton` / `ReasonAction` only |
| D-d | Sign-in gate                 | four variants (G-3)                                                                                                                  | middleware redirect                   |
| D-e | Load error                   | the dashboard pattern plus ad-hoc callouts                                                                                           | `ui/LoadError`                        |
| D-f | Back link                    | "← MY ORDERS" (mono, uppercase) vs "← Back to the order"                                                                             | `ui/BackLink`                         |
| D-g | Checkbox and radio styling   | Field, Quiz, QuizBuilder, Player                                                                                                     | `ui/Checkbox`, `ui/Radio`             |
| D-h | File input                   | native in teach-with-us, payment proof, profile photo                                                                                | `ui/FileInput`                        |
| D-i | App chrome                   | SiteHeader plus teacher staff bar plus admin side nav                                                                                | one `StaffBar` for staff (G-15)       |
| D-j | Duration and date formatting | at least five formats (G-9)                                                                                                          | `lib/format` helpers                  |

---

## Against the mockups

| Mockup board                 | Biggest gaps in the build                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                         | Close on structure. Eyebrow colour and the showcase answer box (H-1).                                                                                                                               |
| Catalogue                    | No active-filter chips or "Clear all"; results row and sort not on one line; teacher names in mono instead of Sans with an avatar (CA-1, CA-2).                                                     |
| Course detail                | No playable free preview at the top ("2 of 24 lessons are free to watch"); syllabus rows don't show PREVIEW and duration as links (C-1).                                                            |
| Order and payment            | No stepper; no "Pay by" chip; amount not in a sand tile; reference not in a highlighter tile; no order-summary column; amount not prefilled; native file input instead of the dropzone (O-2, AU-8). |
| My learning                  | No "Continue" hero; cards lack "Next: …" with Continue; no orders column (D-1).                                                                                                                     |
| Quiz workbench               | Not a focused mode; no Exit or always-visible "Submit attempt"; no unit suffix; pip states weaker (Q-1…Q-3). The locked mark-scheme panel isn't built.                                              |
| Admin · payment verification | Single dark admin bar vs AppBar plus side nav; no CLAIMED or TXN ID columns; selected-row bar; decision radios and a decision-labelled primary action; "Reject…" danger outline (G-15, A-3).        |

---

## Method and environment

**Environment:**

- API on `localhost:3100`.
- Production build of `/web` on `localhost:3101`.
- Postgres `lms_qa` with seeded QA data (≈1,500 orders, 200 courses in review, 2,000 applications).
- Headless Chromium (Playwright-core) with axe-core.

**Crawl:**

- Every route in the screen map as guest, student (`qa.student4204`), a fresh student, teacher (`qa.teacher1`), an empty teacher, and admin (with TOTP).
- Each at 1440, 768 and 380px.
- Checks per page:
  - full-page screenshot
  - axe
  - focus walk
  - target sizes
  - computed colour, font, radius, shadow and border census against `tokens.css`
  - heading outline
  - horizontal overflow (none found)

**States script:**

- Empty and invalid submits on every form.
- Wrong password.
- Pending states (delayed requests).
- Loading states (API held for 5s).
- Error states (API forced to 500).
- Every destructive control, opened and then cancelled.
- Copy-to-clipboard.
- Keyboard order on login.
- A full quiz attempt up to the submit confirmation.

**axe** reports no violations on any page after the quiz LaTeX fixture was corrected. The issues above are the ones axe can't see.

**Side effects on the QA database.** Three controls had no confirmation (A-1, A-2, T-9), so "open then cancel" performed the action:

| Change                                                                                                   | Status                     |
| -------------------------------------------------------------------------------------------------------- | -------------------------- |
| Course `a61dff1c…` ("Accounting (0452) — part 1170") moved from PENDING_APPROVAL to **PUBLISHED (Free)** | Not reverted               |
| Application `1ef5ec19…` ("Applicant 360") moved from SUBMITTED to **REJECTED**                           | Not reverted               |
| `qa.teacher1`'s public profile was unpublished                                                           | **Republished** afterwards |

Also changed during the review:

- `qa.student4204` now has lessons Topic 1.1–1.5 complete and one in-progress attempt on "Practice quiz: supply and demand".
- Their other sessions were signed out.
- Unchanged values were re-saved: name, course details and teacher profile.

No payment was confirmed or rejected, and no user was suspended. The two changes not reverted need a DB update to undo; say if you want that.
