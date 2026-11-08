# Administrator guide

For the people who run the platform day to day: approving teachers and courses, verifying payments, paying teachers, and managing accounts (#123). Each task names the admin API endpoint behind it, so the guide is usable before the admin screens of the web app exist and stays accurate after (the screens call the same endpoints).

> Every procedure below matches the backend as merged. Where a value is still an open client question (enrollment duration #125, bank account and currency #127, refund rules #129, payout cycle #130, verification turnaround #131), it is a platform setting or an optional field, and the guide says so.

## Contents

- [Signing in](#signing-in)
- [User management](#user-management)
- [Teacher applications and teacher accounts](#teacher-applications-and-teacher-accounts)
- [Course approval](#course-approval)
- [Enrollments](#enrollments)
- [Dashboard](#dashboard)
- [Orders and payment verification](#orders-and-payment-verification)
- [Refunds](#refunds)
- [Teacher ledger and manual adjustments](#teacher-ledger-and-manual-adjustments)
- [Teacher payouts](#teacher-payouts)
- [Payout concerns](#payout-concerns)
- [Finance views](#finance-views)
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
| See one account        | `GET /admin/users/:userId` (roles, status, verification, last sign-in); `GET /admin/users/:userId/overview` adds their enrollments, courses taught and orders    |
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

## Dashboard

`GET /admin/dashboard` shows what needs attention: courses waiting for approval, teacher applications to review, payments waiting for verification and open payout concerns, with one total for the navigation badge, plus today's figures (from midnight UTC). Start each working day here.

## Orders and payment verification

Students pay by **bank transfer** into the account in the `BANK_TRANSFER_INSTRUCTIONS` setting. They place an order (the price is frozen at that moment and the order gets a **payment reference** they put in the transfer remark), transfer the money, then submit a **payment proof**: the bank's transaction ID, optionally the amount they say they paid, and optionally a screenshot or PDF. An order with no proof lapses after the expiry window (setting `ORDER_EXPIRY_WINDOW_HOURS`, default 48) and the student is emailed.

| Status            | Meaning                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `PENDING`         | Waiting for the student's proof (also after you asked for a top-up)                                     |
| `PROOF_SUBMITTED` | Waiting for you: it is in the verification queue                                                        |
| `VERIFIED`        | Payment confirmed: access granted, receipt issued, teacher earnings written                             |
| `REJECTED`        | You rejected the proof. The student may submit a new proof on the same order; the expiry clock restarts |
| `LAPSED`          | No proof within the expiry window                                                                       |
| `REFUNDED`        | Refunded after verification (see [Refunds](#refunds))                                                   |

### The verification queue

- **Queue:** `GET /admin/verification/queue?limit=50&offset=0`. Oldest first. Each entry shows the order total and currency, the courses and teachers, the student, the proofs you are deciding on now (those since the last full rejection), how long it has waited and whether it is past the published turnaround, what the student claims to have paid against the total, any amount already received before a top-up request, and **duplicate transaction ID warnings** (the same bank transaction ID used on another order).
- **Metrics:** `GET /admin/verification/metrics`: queue size, the oldest waiting order and its age, and how many orders are past the turnaround (setting `VERIFICATION_TURNAROUND_HOURS`, default 48; the final figure is client question #131).
- **One order in full:** `GET /admin/orders/:orderId`: frozen line items (price and commission at order time), every proof and every earlier decision.

### Deciding a payment

1. Find the transfer **in the bank statement** by the payment reference, transaction ID and amount. Never decide from the screenshot alone: screenshots are easy to fake.
2. If there is a duplicate transaction ID warning, open both orders first. One bank transfer pays for one order.
3. **Confirm:** `POST /admin/verification/orders/:orderId/confirm` with

   ```json
   { "amountReceivedMinor": "150000", "valueDate": "2026-11-07", "notes": "optional" }
   ```

   `amountReceivedMinor` is the total that actually reached the account for this order, across all transfers, in minor units. `valueDate` is the bank's value date (`YYYY-MM-DD`, not in the future). When the amount equals the order total, the order becomes `VERIFIED` and, in the same transaction, the student is enrolled in every course on the order (even one whose enrollment has closed since: they paid) and each teacher's earning is written to their ledger. The student gets a confirmation email with the receipt.

4. **Amount differs:** the confirm call then also needs `mismatchAction`:

   | `mismatchAction` | When                             | Result                                                                                                                                                                            |
   | ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `CONFIRM_ANYWAY` | Short or over, and you accept it | Confirmed exactly as above. Explain why in `notes`                                                                                                                                |
   | `REQUEST_TOP_UP` | Short payments only              | The order goes back to `PENDING` and the student is emailed the missing amount. Their next proof joins this one; when you confirm, enter the total received across both transfers |
   | `REJECT`         | Short or over                    | Rejected. The reason is `AMOUNT_SHORT` for a short payment; for an overpayment give `rejectionReason` (default `OTHER`) and say in `notes` how the excess will be returned        |

   Sending a `mismatchAction` when the amount matches is refused.

5. **Reject** (no matching transfer, wrong transaction ID...): `POST /admin/verification/orders/:orderId/reject` with `{ "rejectionReason": "...", "notes": "..." }`. Reasons: `NO_PAYMENT_RECEIVED`, `AMOUNT_SHORT`, `INVALID_TRANSACTION_ID`, `DUPLICATE_TRANSACTION`, `OTHER` (`notes` required). The student is emailed the reason and your notes, and can submit a new proof on the same order.

Only an order in `PROOF_SUBMITTED` can be decided; a second admin acting on the same order at the same time gets a refusal, not a double confirmation. Every decision is in the audit log. Aim to keep every order inside the turnaround.

## Refunds

For a **verified** order whose money you have returned to the student (outside the platform, by bank transfer):

`POST /admin/orders/:orderId/refund` with

```json
{
  "amountMinor": "150000",
  "transferDate": "2026-11-07",
  "transactionId": "bank ref of the refund transfer",
  "reason": "why"
}
```

In one transaction the refund is recorded, the order becomes `REFUNDED`, the student loses access to the order's courses, and each teacher's earning for the order is reversed by a negative `REFUND` entry on their ledger. The amount must be positive and at most the order total. The ledger reversal is always the teacher's full net earning for each line, whatever amount you refunded. If the teacher should keep part of it (a partial refund), record a credit adjustment for that part (next section) and explain it in the reason. A refunded order cannot be refunded twice. The refund rules themselves (who is entitled, time limits) are client question #129.

## Teacher ledger and manual adjustments

Each teacher has an **append-only ledger**: an `EARNING` when a sale is confirmed (price minus the platform commission), a negative `REFUND` when it is refunded, a negative `PAYOUT` when you pay them, and signed `ADJUSTMENT`s. Entries are never edited or deleted; a mistake is corrected by a new entry. The balance is the sum of the entries, per currency.

| Task                       | How                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See earnings               | `GET /admin/teachers/:teacherId/earnings`: pending sales (not yet verified) separately from confirmed sales, gross, commission, net, balances, the ledger and payouts            |
| Record a manual adjustment | `POST /admin/teachers/:teacherId/ledger/adjustments` `{ "amountMinor": "-5000", "currency": "PKR", "reason": "..." }`. Positive credits the teacher, negative debits; never zero |

Use adjustments sparingly and always with a reason the teacher will understand: they see every entry on their own statement.

## Teacher payouts

You pay teachers by bank transfer **outside** the platform, then record it. The payout cycle (weekly, monthly...) is client question #130.

1. Check what is owed: `GET /admin/teachers/:teacherId/statement` (or `/earnings`).
2. Make the bank transfer.
3. **Record it:** `POST /admin/teachers/:teacherId/payouts` with

   ```json
   {
     "amountMinor": "120000",
     "currency": "PKR",
     "transactionId": "bank ref",
     "transferDate": "2026-11-07",
     "method": "IBFT",
     "periodStart": "2026-10-01",
     "periodEnd": "2026-10-31"
   }
   ```

   `method` and the covered period are optional. The amount cannot exceed the teacher's balance in that currency. A negative `PAYOUT` entry is written to the ledger and the teacher is emailed.

4. The payout is `PENDING` for the dispute window (setting `PAYOUT_DISPUTE_WINDOW_DAYS`, default 7). If the teacher raises nothing, an hourly job marks it `ACCEPTED`.

History: `GET /admin/teachers/:teacherId/payouts`; one payout with its concern: `GET /admin/payouts/:payoutId`.

## Payout concerns

A teacher who disagrees with a payout raises a **concern** within the dispute window; the payout becomes `DISPUTED` and stops auto-accepting.

1. **Open concerns, oldest first, with their age:** `GET /admin/payout-concerns`. None should be left unresolved; they also count on the dashboard.
2. Investigate with the payout (`GET /admin/payouts/:payoutId`), the teacher's statement and the bank records.
3. **Resolve:** `POST /admin/payouts/:payoutId/concerns/resolve` with `resolutionNotes` (the teacher reads them) and, if money is owed either way, an optional signed `adjustmentAmountMinor` (and `adjustmentCurrency`), written to the ledger in the same transaction. The payout becomes `RESOLVED`. If the teacher is owed more, record a further payout once you have transferred it.

## Finance views

| View                      | Endpoint                                                   | Shows                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Financial summary         | `GET /admin/finance/summary?from=2026-10-01&to=2026-10-31` | For the period (UTC dates, inclusive, both optional): confirmed sales, platform commission, refunds, payouts, and outstanding liability (what is owed to teachers) |
| Teacher account statement | `GET /admin/teachers/:teacherId/statement`                 | One teacher's sales, commission, refunds, adjustments, payouts and current balance                                                                                 |
| Open payout concerns      | `GET /admin/payout-concerns`                               | Every open concern with its age                                                                                                                                    |

Reconcile the summary against the bank statement at the end of each period: confirmed sales should match money received, and payouts and refunds money sent.

## Platform settings

Values the business may change without a release. Endpoints: `GET /admin/settings`, `PUT /admin/settings/:key` `{ "value": "..." }`. Every change is audited.

| Setting                          | Default     | Meaning                                                                                                                             |
| -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ORDER_EXPIRY_WINDOW_HOURS`      | 48          | Hours a pending order waits for a payment proof before it lapses (1–720)                                                            |
| `PAYOUT_DISPUTE_WINDOW_DAYS`     | 7           | Days a teacher has to dispute a payout before it auto-accepts (1–60)                                                                |
| `VIDEO_COMPLETION_THRESHOLD_PCT` | 90          | Share of a video watched that marks the lesson complete (50–100)                                                                    |
| `APPLICATION_RETENTION_DAYS`     | 180         | Days a rejected teacher application and CV are kept (30–3650)                                                                       |
| `VERIFICATION_TURNAROUND_HOURS`  | 48          | Published promise for verifying a payment; the queue flags orders past it (1–720)                                                   |
| `BANK_TRANSFER_INSTRUCTIONS`     | placeholder | Bank account details and transfer steps shown at checkout and in the order email. **Set the real account before going live** (#127) |

New settings appear here automatically as features add them.

## Audit log

Every sensitive action (account changes, application decisions, course decisions and pricing, enrollment grants and revocations, setting changes, payment and payout actions) is recorded with who, what, when, from which IP, and the reason. It cannot be edited.

Search: `GET /admin/audit-log` with any of `actorEmail`, `action` (e.g. `USER_SUSPENDED`), `entityType` (e.g. `course`), `entityId`, `from`, `to`. Use it to answer "who changed this price?" or "why was this student's access revoked?".

## Good practice

- Always give a clear reason: teachers and students read rejection, unpublish and revocation reasons, and the audit log keeps them.
- Money values in the API are strings of minor units (`"150000"`), never decimals.
- Do not share admin accounts. Create one per person, so the audit log means something, and suspend it when the person leaves.
- If something looks wrong in the system, note the time and the `x-request-id` shown with the error and send them to the technical operator; it finds the exact log lines.
