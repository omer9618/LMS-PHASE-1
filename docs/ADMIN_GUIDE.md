# Administrator guide

For the people who run the platform day to day: approving teachers and courses, verifying payments, paying teachers, and managing accounts (#123). Each task names the admin API endpoint behind it, so the guide is usable before the admin screens of the web app exist and stays accurate after (the screens call the same endpoints).

> **Status of this guide.** Sections marked **(coming)** describe features whose backend is still being built (payment verification #63–#67, ledger and payouts #78–#89, finance views #103–#105). They describe the agreed procedure so the operations team can prepare; endpoint names will be added when those features merge.

## Contents

- [Signing in](#signing-in)
- [User management](#user-management)
- [Teacher applications and teacher accounts](#teacher-applications-and-teacher-accounts)
- [Course approval](#course-approval)
- [Enrollments](#enrollments)
- [Orders and payment verification](#orders-and-payment-verification)
- [Teacher payouts](#teacher-payouts)
- [Platform settings](#platform-settings)
- [Audit log](#audit-log)
- [Good practice](#good-practice)

## Signing in

- Admin accounts **must** use multi-factor authentication (an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy). The first time you sign in you are asked to scan a QR code and confirm a 6-digit code. Until you do, every admin page answers "MFA required".
- After enrolling, **generate recovery codes** (`POST /auth/mfa/recovery-codes`) and store them offline. Each works once, in place of a 6-digit code, if you lose your phone.
- Sessions end after 7 days, or after 12 hours of inactivity. Sign out on shared computers.
- Forgot your password: use "Forgot password" on the sign-in page. Lost your authenticator and your recovery codes: another admin cannot see your secret; ask the technical operator to reset your MFA, then enrol again.

## User management

Endpoints: `/admin/users`.

| Task                   | How                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find an account        | `GET /admin/users?q=<name or email>&role=TEACHER&status=ACTIVE`                                                                                                  |
| See one account        | `GET /admin/users/:userId` (roles, status, verification, last sign-in)                                                                                           |
| Create a staff account | `POST /admin/users` with email, full name and roles (`ADMIN` and/or `TEACHER`). The person receives an email to set their password. Students register themselves |
| Suspend an account     | `POST /admin/users/:userId/suspend` with a reason. The user is signed out everywhere immediately                                                                 |
| Reactivate an account  | `POST /admin/users/:userId/reactivate` with a reason                                                                                                             |
| Give or remove a role  | `POST /admin/users/:userId/roles` `{ "role": "TEACHER" }`; `DELETE /admin/users/:userId/roles/:role`                                                             |

The platform refuses changes that would lock it out: you cannot change your own status or remove your own admin role, the last active admin cannot be suspended, and every account keeps at least one role. Every change is recorded in the audit log with your name and reason.

A person can hold several roles (for example a teacher who is also an admin). They switch between them in the web app.

## Teacher applications and teacher accounts

Teachers apply through the public form (with their CV). Endpoints: `/admin/teacher-applications`, `/admin/teachers`.

1. **Review queue:** `GET /admin/teacher-applications?status=SUBMITTED`. Open one with `GET /admin/teacher-applications/:id`; download the CV with `GET /admin/teacher-applications/:id/cv`.
2. **Decide:** `POST /admin/teacher-applications/:id/review` with `status` = `UNDER_REVIEW` (interviewing), `REJECTED` or `HIRED`, and optional internal `notes`.
3. **Hired: create the account.** `POST /admin/teacher-applications/:id/account` creates a teacher account from the application; the teacher gets an email to set a password. If the person already has an account (for example as a student), link it instead: `POST /admin/teacher-applications/:id/link` `{ "userId": "..." }`, which adds the teacher role.
4. **Rejected applications** and their CVs are deleted automatically after the retention period (setting `APPLICATION_RETENTION_DAYS`, default 180 days). An admin can run the purge early: `POST /admin/teacher-applications/purge`.

**Teacher profiles** (the public page students see): `GET /admin/teachers/:teacherId/profile` to review it, `PUT /admin/teachers/:teacherId/profile` to correct it, `POST /admin/teachers/:teacherId/profile/unpublish` to hide it (with a reason), and `POST /admin/teachers/:teacherId/profile/photo/remove` to remove an unsuitable photo. Every change is audited.

**Suspending a teacher** (temporary, e.g. during an investigation): suspend the account (above). **Deactivating** (permanent): `POST /admin/teachers/:teacherId/deactivate` with a reason. Students keep access to courses they already have.

## Course approval

Teachers write courses and submit them for review. A course moves `DRAFT → PENDING_APPROVAL → PUBLISHED`, or `REJECTED` (final: the teacher must start a new course), and later `ARCHIVED`. Endpoints: `/admin/courses`.

1. **Review queue:** `GET /admin/courses` (defaults to courses waiting for approval, oldest first). Filter with `?status=PUBLISHED` etc.
2. **Check the course:** `GET /admin/courses/:courseId` (details, proposed price and commission) and `GET /admin/courses/:courseId/outline` (sections and lessons). Quizzes, with their correct answers: `GET /admin/courses/:courseId/lessons/:lessonId/quiz` (read only). Every course must have at least one **free preview video lesson**: it is the demo students see before buying, and submission is refused without one. Check that the preview is representative and the content matches the board, level and subject.
3. **Set the price and commission** (paid courses): `PUT /admin/courses/:courseId/pricing` with `{ "isFree": false, "priceMinor": "150000", "currency": "PKR", "commissionRateBps": 2000 }`. Amounts are in minor units (150000 = 1,500.00) and commission in basis points (2000 = 20 %). The teacher proposed a commission when submitting; the admin's value is final. Free courses: `{ "isFree": true }`. A paid course cannot be approved without both a price and a commission.
4. **Approve:** `POST /admin/courses/:courseId/approve`. The course appears in the catalogue.
5. **Or reject:** `POST /admin/courses/:courseId/reject` with a reason the teacher will read. Rejection is final, so ask for changes informally first if the course is close.

After publication:

| Task                                    | How                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Correct details (title, description...) | `PATCH /admin/courses/:courseId`. Teachers cannot change details of a published course; they can still edit lesson content |
| Change price or commission              | `PUT /admin/courses/:courseId/pricing`. Existing orders keep the price they were placed at                                 |
| Stop new enrollments                    | `PUT /admin/courses/:courseId/enrollment` `{ "open": false }`; `true` to reopen                                            |
| Take the course down for changes        | `POST /admin/courses/:courseId/unpublish` with a reason. It returns to `DRAFT` and the teacher is emailed                  |
| Retire the course                       | `POST /admin/courses/:courseId/archive` (optional reason). Enrolled students keep access; nobody new can enroll            |

Professional development courses (`TEACHER_PD`) are not sold or enrolled in Phase 1.

## Enrollments

Endpoints: `/admin/enrollments`.

- **List:** `GET /admin/enrollments?courseId=...&studentId=...&status=ACTIVE`.
- **Grant access manually** (e.g. the student paid in cash or a scholarship): `POST /admin/enrollments` with `studentEmail`, `courseId`, `paymentChannel` (how they paid, e.g. "Cash at office"), `reason`, and optionally `expiresAt`. Without `expiresAt` access does not expire (the enrollment duration is still an open client question, #125).
- **Revoke:** `POST /admin/enrollments/:enrollmentId/revoke` with a reason. The student loses access immediately.

Teachers can see who is enrolled in their courses but cannot change enrollments.

## Orders and payment verification

Students pay by **bank transfer**. They place an order (the price is frozen at that moment), transfer the money, then upload a **payment proof**: the bank's transaction ID and optionally a screenshot or PDF. An order with no proof lapses after the expiry window (setting `ORDER_EXPIRY_WINDOW_HOURS`, default 48), and the student is emailed.

Order statuses: `PENDING` (waiting for proof) → `PROOF_SUBMITTED` (waiting for you) → `VERIFIED` (access granted, receipt issued) or `REJECTED` (the student may resubmit a proof on the same order, which restarts the expiry clock); also `LAPSED` and `REFUNDED`.

Available now: `GET /admin/orders/:orderId` shows an order with its frozen line items and proofs. The system flags a transaction ID that was already used on another order.

**Verification procedure (coming, #63–#67):**

1. Open the verification queue (oldest first; the queue shows how long the oldest has waited).
2. For each order, find the transfer **in the bank statement** by transaction ID and amount. Never verify from the screenshot alone: screenshots are easy to fake.
3. **Confirm** when the money is in the account: enter the amount received and the value date from the statement. Confirmation grants the student access, issues the receipt and credits the teacher's earnings.
4. **Amount differs:** confirm anyway, ask the student to top up, or reject, and record why.
5. **Reject** with a reason (no payment found, amount short, invalid transaction ID, duplicate transaction, other). The student is told and can resubmit.
6. **Duplicate transaction ID warning:** check both orders before confirming; one bank transfer pays for one order.

Aim to clear the queue at least once every working day. The agreed turnaround is an open client question (#131).

## Teacher payouts

**(coming, #78–#89).** Each teacher has a ledger: an earning entry when one of their sales is confirmed (price minus the platform commission), refunds and manual adjustments as separate entries. Entries are never edited or deleted; corrections are new entries. The balance is the sum of the ledger.

Planned procedure:

1. Check the teacher's statement (balance, confirmed versus pending sales).
2. Pay the teacher by bank transfer **outside** the platform.
3. **Record the payout** with the amount, date and bank reference. The teacher is notified.
4. The teacher has a dispute window (setting `PAYOUT_DISPUTE_WINDOW_DAYS`, default 7) to raise a concern; otherwise the payout is accepted automatically.
5. **Concerns** appear in the open concerns view with their age. Investigate, then resolve with a written outcome; if money is owed, record an adjustment and a further payout.

The payout cycle (weekly, monthly...) is an open client question (#130).

## Platform settings

Values the business may change without a release. Endpoints: `GET /admin/settings`, `PUT /admin/settings/:key` `{ "value": "..." }`. Every change is audited.

| Setting                          | Default | Meaning                                                                  |
| -------------------------------- | ------- | ------------------------------------------------------------------------ |
| `ORDER_EXPIRY_WINDOW_HOURS`      | 48      | Hours a pending order waits for a payment proof before it lapses (1–720) |
| `PAYOUT_DISPUTE_WINDOW_DAYS`     | 7       | Days a teacher has to dispute a payout before it auto-accepts (1–60)     |
| `VIDEO_COMPLETION_THRESHOLD_PCT` | 90      | Share of a video watched that marks the lesson complete (50–100)         |
| `APPLICATION_RETENTION_DAYS`     | 180     | Days a rejected teacher application and CV are kept (30–3650)            |

New settings appear here automatically as features add them.

## Audit log

Every sensitive action (account changes, application decisions, course decisions and pricing, enrollment grants and revocations, setting changes, payment and payout actions) is recorded with who, what, when, from which IP, and the reason. It cannot be edited.

Search: `GET /admin/audit-log` with any of `actorEmail`, `action` (e.g. `USER_SUSPENDED`), `entityType` (e.g. `course`), `entityId`, `from`, `to`. Use it to answer "who changed this price?" or "why was this student's access revoked?".

## Good practice

- Always give a clear reason: teachers and students read rejection, unpublish and revocation reasons, and the audit log keeps them.
- Money values in the API are strings of minor units (`"150000"`), never decimals.
- Do not share admin accounts. Create one per person, so the audit log means something, and suspend it when the person leaves.
- If something looks wrong in the system, note the time and the `x-request-id` shown with the error and send them to the technical operator; it finds the exact log lines.
