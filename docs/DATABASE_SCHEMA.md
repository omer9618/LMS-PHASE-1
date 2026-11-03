# Database schema

Generated from `prisma/schema.prisma` by `node scripts/schema-doc.mjs`; do not edit by hand. Regenerate after every migration. Rules behind the schema (money in minor units, the append-only ledger, additions to Schema v2.0) are in [PRISMA_SETUP.md](PRISMA_SETUP.md).

**32 tables, 22 enums.** Names below are the PostgreSQL names. Every primary key is a UUID, every timestamp is `timestamptz` (UTC), and money columns end in `_minor` (integer minor units).

## Contents

- **Users and access:** `users`, `user_roles`, `sessions`, `auth_tokens`, `mfa_recovery_codes`, `teacher_profiles`, `teacher_applications`
- **Curriculum reference data:** `boards`, `levels`, `subjects`
- **Courses and content:** `courses`, `sections`, `lessons`, `video_assets`, `lesson_resources`
- **Assessment:** `quizzes`, `questions`, `quiz_attempts`, `question_responses`
- **Enrollment:** `enrollments`
- **Orders and payment:** `orders`, `order_items`, `payment_proofs`, `payment_verifications`, `refunds`
- **Financial ledger:** `teacher_ledger`, `payouts`, `payout_disputes`
- **Progress:** `lesson_progress`, `video_watch_progress`
- **Platform:** `audit_log`, `platform_settings`
- **Enums**

## Users and access

### users

| Column                 | Type            | Null | Notes                                                                                     |
| ---------------------- | --------------- | ---- | ----------------------------------------------------------------------------------------- |
| `id`                   | text            |      | primary key; default `uuid()`                                                             |
| `email`                | citext          |      | unique                                                                                    |
| `full_name`            | text            | yes  | Not in Schema v2.0: display name for students, teachers and admins (#11, #41, #99).       |
| `password_hash`        | text            |      |                                                                                           |
| `is_email_verified`    | boolean         |      | default `false`                                                                           |
| `guardian_name`        | text            | yes  |                                                                                           |
| `guardian_email`       | text            | yes  |                                                                                           |
| `guardian_phone`       | text            | yes  |                                                                                           |
| `status`               | enum UserStatus |      | default `ACTIVE`                                                                          |
| `created_at`           | timestamptz(3)  |      | default `now()`                                                                           |
| `last_login_at`        | timestamptz(3)  | yes  |                                                                                           |
| `mfa_secret_encrypted` | text            | yes  | Not in Schema v2.0: TOTP MFA (#16). Secret is AES-256-GCM encrypted; set before enabling. |
| `mfa_enabled_at`       | timestamptz(3)  | yes  |                                                                                           |
| `mfa_last_used_step`   | integer         | yes  | Last accepted 30-second TOTP step, so a code cannot be used twice.                        |

### user_roles

| Column       | Type           | Null | Notes                          |
| ------------ | -------------- | ---- | ------------------------------ |
| `id`         | text           |      | primary key; default `uuid()`  |
| `user_id`    | text           |      | FK → users (on delete Cascade) |
| `role`       | enum Role      |      |                                |
| `granted_at` | timestamptz(3) |      | default `now()`                |

Constraints and indexes:

- `@@unique([user_id, role])`

### sessions

Server-side login sessions (#12). Not part of Schema v2.0: added so logout and password reset (#13) can revoke access immediately. See docs/PRISMA_SETUP.md. The cookie holds a random token; only its SHA-256 hash is stored here.

| Column            | Type           | Null | Notes                                                            |
| ----------------- | -------------- | ---- | ---------------------------------------------------------------- |
| `id`              | text           |      | primary key; default `uuid()`                                    |
| `user_id`         | text           |      | FK → users (on delete Cascade)                                   |
| `token_hash`      | char(64)       |      | unique                                                           |
| `created_at`      | timestamptz(3) |      | default `now()`                                                  |
| `expires_at`      | timestamptz(3) |      |                                                                  |
| `last_seen_at`    | timestamptz(3) |      | default `now()`                                                  |
| `revoked_at`      | timestamptz(3) | yes  |                                                                  |
| `ip_address`      | text           | yes  |                                                                  |
| `user_agent`      | text           | yes  |                                                                  |
| `mfa_verified_at` | timestamptz(3) | yes  | Set when this session passed MFA (#16). Admin routes require it. |

Constraints and indexes:

- `@@index([user_id])`
- `@@index([expires_at])`

### auth_tokens

Single-use, expiring tokens emailed to users (#11 email verification, #13 password reset). Like sessions, only the SHA-256 hash of the token is stored.

| Column       | Type                  | Null | Notes                          |
| ------------ | --------------------- | ---- | ------------------------------ |
| `id`         | text                  |      | primary key; default `uuid()`  |
| `user_id`    | text                  |      | FK → users (on delete Cascade) |
| `purpose`    | enum AuthTokenPurpose |      |                                |
| `token_hash` | char(64)              |      | unique                         |
| `created_at` | timestamptz(3)        |      | default `now()`                |
| `expires_at` | timestamptz(3)        |      |                                |
| `used_at`    | timestamptz(3)        | yes  |                                |

Constraints and indexes:

- `@@index([user_id, purpose])`
- `@@index([expires_at])`

### mfa_recovery_codes

One-time MFA recovery codes (#16). Stored as keyed HMAC-SHA256, never in plain text.

| Column       | Type           | Null | Notes                          |
| ------------ | -------------- | ---- | ------------------------------ |
| `id`         | text           |      | primary key; default `uuid()`  |
| `user_id`    | text           |      | FK → users (on delete Cascade) |
| `code_hash`  | char(64)       |      |                                |
| `created_at` | timestamptz(3) |      | default `now()`                |
| `used_at`    | timestamptz(3) | yes  |                                |

Constraints and indexes:

- `@@unique([user_id, code_hash])`

### teacher_profiles

| Column           | Type    | Null | Notes                                       |
| ---------------- | ------- | ---- | ------------------------------------------- |
| `user_id`        | text    |      | primary key; FK → users (on delete Cascade) |
| `bio`            | text    | yes  |                                             |
| `photo_url`      | text    | yes  |                                             |
| `qualifications` | text    | yes  |                                             |
| `social_links`   | jsonb   | yes  |                                             |
| `f2f_locations`  | jsonb   | yes  |                                             |
| `is_published`   | boolean |      | default `false`                             |

### teacher_applications

| Column            | Type                   | Null | Notes                         |
| ----------------- | ---------------------- | ---- | ----------------------------- |
| `id`              | text                   |      | primary key; default `uuid()` |
| `user_id`         | text                   | yes  | FK → users                    |
| `applicant_name`  | text                   |      |                               |
| `applicant_email` | text                   |      |                               |
| `applicant_phone` | text                   | yes  |                               |
| `subjects`        | text                   | yes  |                               |
| `cv_url`          | text                   |      |                               |
| `status`          | enum ApplicationStatus |      | default `SUBMITTED`           |
| `reviewed_by`     | text                   | yes  | FK → users                    |
| `reviewed_at`     | timestamptz(3)         | yes  |                               |
| `review_notes`    | text                   | yes  |                               |
| `purge_after`     | date                   | yes  |                               |
| `created_at`      | timestamptz(3)         |      | default `now()`               |

## Curriculum reference data

### boards

| Column      | Type    | Null | Notes                         |
| ----------- | ------- | ---- | ----------------------------- |
| `id`        | text    |      | primary key; default `uuid()` |
| `name`      | text    |      |                               |
| `code`      | text    | yes  |                               |
| `is_active` | boolean |      | default `true`                |

### levels

| Column        | Type    | Null | Notes                         |
| ------------- | ------- | ---- | ----------------------------- |
| `id`          | text    |      | primary key; default `uuid()` |
| `board_id`    | text    |      | FK → boards                   |
| `name`        | text    |      |                               |
| `order_index` | integer |      |                               |
| `is_active`   | boolean |      | default `true`                |

Constraints and indexes:

- `@@unique([id, board_id])`

### subjects

| Column      | Type    | Null | Notes                         |
| ----------- | ------- | ---- | ----------------------------- |
| `id`        | text    |      | primary key; default `uuid()` |
| `name`      | text    |      |                               |
| `is_active` | boolean |      | default `true`                |

## Courses and content

### courses

| Column                 | Type                 | Null | Notes                         |
| ---------------------- | -------------------- | ---- | ----------------------------- |
| `id`                   | text                 |      | primary key; default `uuid()` |
| `teacher_id`           | text                 |      | FK → users                    |
| `board_id`             | text                 |      | FK → levels                   |
| `level_id`             | text                 |      | FK → levels                   |
| `subject_id`           | text                 |      | FK → subjects                 |
| `syllabus_area`        | text                 | yes  |                               |
| `title`                | text                 |      |                               |
| `description`          | text                 | yes  |                               |
| `demo_video_asset_id`  | text                 | yes  | FK → video_assets             |
| `price_minor`          | bigint               | yes  |                               |
| `currency`             | char(3)              | yes  |                               |
| `commission_rate_bps`  | integer              | yes  |                               |
| `teacher_proposed_bps` | integer              | yes  |                               |
| `priced_by`            | text                 | yes  | FK → users                    |
| `priced_at`            | timestamptz(3)       | yes  |                               |
| `is_free`              | boolean              |      | default `false`               |
| `status`               | enum CourseStatus    |      | default `DRAFT`               |
| `progression_mode`     | enum ProgressionMode |      | default `FREE`                |
| `audience_type`        | enum AudienceType    |      | default `STUDENT`             |
| `is_enrollment_open`   | boolean              |      | default `true`                |
| `created_at`           | timestamptz(3)       |      | default `now()`               |
| `published_at`         | timestamptz(3)       | yes  |                               |
| `archived_at`          | timestamptz(3)       | yes  |                               |

Constraints and indexes:

- `@@index([board_id, level_id, subject_id, status])`

### sections

| Column        | Type    | Null | Notes                            |
| ------------- | ------- | ---- | -------------------------------- |
| `id`          | text    |      | primary key; default `uuid()`    |
| `course_id`   | text    |      | FK → courses (on delete Cascade) |
| `title`       | text    |      |                                  |
| `order_index` | integer |      |                                  |

### lessons

| Column            | Type            | Null | Notes                             |
| ----------------- | --------------- | ---- | --------------------------------- |
| `id`              | text            |      | primary key; default `uuid()`     |
| `section_id`      | text            |      | FK → sections (on delete Cascade) |
| `title`           | text            |      |                                   |
| `type`            | enum LessonType |      |                                   |
| `order_index`     | integer         |      |                                   |
| `video_asset_id`  | text            | yes  | FK → video_assets                 |
| `body_text`       | text            | yes  |                                   |
| `is_free_preview` | boolean         |      | default `false`                   |
| `created_at`      | timestamptz(3)  |      | default `now()`                   |

### video_assets

| Column              | Type               | Null | Notes                         |
| ------------------- | ------------------ | ---- | ----------------------------- |
| `id`                | text               |      | primary key; default `uuid()` |
| `provider`          | enum VideoProvider |      |                               |
| `provider_video_id` | text               |      |                               |
| `duration_seconds`  | integer            | yes  |                               |
| `status`            | enum VideoStatus   |      | default `PROCESSING`          |
| `created_at`        | timestamptz(3)     |      | default `now()`               |

### lesson_resources

| Column            | Type    | Null | Notes                            |
| ----------------- | ------- | ---- | -------------------------------- |
| `id`              | text    |      | primary key; default `uuid()`    |
| `lesson_id`       | text    |      | FK → lessons (on delete Cascade) |
| `file_url`        | text    |      |                                  |
| `file_name`       | text    |      |                                  |
| `file_size_bytes` | integer | yes  |                                  |
| `order_index`     | integer |      |                                  |

## Assessment

### quizzes

| Column               | Type               | Null | Notes                                    |
| -------------------- | ------------------ | ---- | ---------------------------------------- |
| `id`                 | text               |      | primary key; default `uuid()`            |
| `lesson_id`          | text               |      | unique; FK → lessons (on delete Cascade) |
| `time_limit_seconds` | integer            | yes  |                                          |
| `max_attempts`       | integer            | yes  |                                          |
| `is_breakpoint`      | boolean            |      | default `false`                          |
| `passing_score_pct`  | integer            | yes  |                                          |
| `reveal_answers`     | enum RevealAnswers |      | default `AFTER_ATTEMPT`                  |
| `created_at`         | timestamptz(3)     |      | default `now()`                          |

### questions

| Column              | Type              | Null | Notes                            |
| ------------------- | ----------------- | ---- | -------------------------------- |
| `id`                | text              |      | primary key; default `uuid()`    |
| `quiz_id`           | text              |      | FK → quizzes (on delete Cascade) |
| `type`              | enum QuestionType |      |                                  |
| `content_text`      | text              |      |                                  |
| `content_image_url` | text              | yes  |                                  |
| `options`           | jsonb             | yes  |                                  |
| `correct_answer`    | text              |      |                                  |
| `numeric_tolerance` | decimal(18, 6)    | yes  |                                  |
| `numeric_unit`      | text              | yes  |                                  |
| `marks`             | integer           |      | default `1`                      |
| `explanation`       | text              | yes  |                                  |
| `order_index`       | integer           |      |                                  |

### quiz_attempts

| Column           | Type           | Null | Notes                         |
| ---------------- | -------------- | ---- | ----------------------------- |
| `id`             | text           |      | primary key; default `uuid()` |
| `student_id`     | text           |      | FK → users                    |
| `quiz_id`        | text           |      | FK → quizzes                  |
| `attempt_number` | integer        |      |                               |
| `score_pct`      | integer        | yes  |                               |
| `is_passed`      | boolean        | yes  |                               |
| `started_at`     | timestamptz(3) |      | default `now()`               |
| `submitted_at`   | timestamptz(3) | yes  |                               |

Constraints and indexes:

- `@@unique([student_id, quiz_id, attempt_number])`

### question_responses

| Column           | Type    | Null | Notes                                  |
| ---------------- | ------- | ---- | -------------------------------------- |
| `id`             | text    |      | primary key; default `uuid()`          |
| `attempt_id`     | text    |      | FK → quiz_attempts (on delete Cascade) |
| `question_id`    | text    |      | FK → questions                         |
| `student_answer` | text    | yes  |                                        |
| `is_correct`     | boolean | yes  |                                        |
| `marks_awarded`  | integer | yes  |                                        |

Constraints and indexes:

- `@@unique([attempt_id, question_id])`

## Enrollment

### enrollments

| Column            | Type                  | Null | Notes                         |
| ----------------- | --------------------- | ---- | ----------------------------- |
| `id`              | text                  |      | primary key; default `uuid()` |
| `student_id`      | text                  |      | FK → users                    |
| `course_id`       | text                  |      | FK → courses                  |
| `order_item_id`   | text                  | yes  | FK → order_items              |
| `status`          | enum EnrollmentStatus |      | default `ACTIVE`              |
| `source`          | enum EnrollmentSource |      |                               |
| `payment_channel` | text                  | yes  |                               |
| `granted_by`      | text                  | yes  | FK → users                    |
| `granted_at`      | timestamptz(3)        |      | default `now()`               |
| `expires_at`      | timestamptz(3)        | yes  |                               |
| `revoked_at`      | timestamptz(3)        | yes  |                               |

Constraints and indexes:

- `@@unique([student_id, course_id])`

## Orders and payment

### orders

| Column              | Type             | Null | Notes                         |
| ------------------- | ---------------- | ---- | ----------------------------- |
| `id`                | text             |      | primary key; default `uuid()` |
| `student_id`        | text             |      | FK → users                    |
| `payment_reference` | text             |      | unique                        |
| `total_minor`       | bigint           |      |                               |
| `currency`          | char(3)          |      |                               |
| `status`            | enum OrderStatus |      | default `PENDING`             |
| `expires_at`        | timestamptz(3)   | yes  |                               |
| `created_at`        | timestamptz(3)   |      | default `now()`               |
| `verified_at`       | timestamptz(3)   | yes  |                               |

Constraints and indexes:

- `@@index([status, expires_at])`

### order_items

| Column                | Type    | Null | Notes                           |
| --------------------- | ------- | ---- | ------------------------------- |
| `id`                  | text    |      | primary key; default `uuid()`   |
| `order_id`            | text    |      | FK → orders (on delete Cascade) |
| `course_id`           | text    |      | FK → courses                    |
| `teacher_id`          | text    |      | FK → users                      |
| `price_minor`         | bigint  |      |                                 |
| `commission_rate_bps` | integer |      |                                 |
| `commission_minor`    | bigint  |      |                                 |
| `net_teacher_minor`   | bigint  |      |                                 |

Constraints and indexes:

- `@@unique([order_id, course_id])`

### payment_proofs

| Column                 | Type           | Null | Notes                           |
| ---------------------- | -------------- | ---- | ------------------------------- |
| `id`                   | text           |      | primary key; default `uuid()`   |
| `order_id`             | text           |      | FK → orders (on delete Cascade) |
| `transaction_id`       | text           |      |                                 |
| `proof_file_url`       | text           | yes  |                                 |
| `amount_claimed_minor` | bigint         | yes  |                                 |
| `submitted_at`         | timestamptz(3) |      | default `now()`                 |

Constraints and indexes:

- `@@index([transaction_id])`

### payment_verifications

| Column                  | Type                     | Null | Notes                         |
| ----------------------- | ------------------------ | ---- | ----------------------------- |
| `id`                    | text                     |      | primary key; default `uuid()` |
| `order_id`              | text                     |      | FK → orders                   |
| `proof_id`              | text                     | yes  | FK → payment_proofs           |
| `outcome`               | enum VerificationOutcome |      |                               |
| `amount_received_minor` | bigint                   | yes  |                               |
| `value_date`            | date                     | yes  |                               |
| `mismatch_action`       | enum MismatchAction      | yes  |                               |
| `rejection_reason`      | enum RejectionReason     | yes  |                               |
| `notes`                 | text                     | yes  |                               |
| `verified_by`           | text                     |      | FK → users                    |
| `verified_at`           | timestamptz(3)           |      | default `now()`               |

### refunds

| Column           | Type           | Null | Notes                         |
| ---------------- | -------------- | ---- | ----------------------------- |
| `id`             | text           |      | primary key; default `uuid()` |
| `order_id`       | text           |      | FK → orders                   |
| `amount_minor`   | bigint         |      |                               |
| `reason`         | text           | yes  |                               |
| `transaction_id` | text           | yes  |                               |
| `transfer_date`  | date           | yes  |                               |
| `authorised_by`  | text           |      | FK → users                    |
| `created_at`     | timestamptz(3) |      | default `now()`               |

## Financial ledger

### teacher_ledger

Append-only. Balance = SUM(amount_minor). No stored balance column.

| Column          | Type                 | Null | Notes                         |
| --------------- | -------------------- | ---- | ----------------------------- |
| `id`            | text                 |      | primary key; default `uuid()` |
| `teacher_id`    | text                 |      | FK → users                    |
| `type`          | enum LedgerEntryType |      |                               |
| `amount_minor`  | bigint               |      |                               |
| `currency`      | char(3)              |      |                               |
| `order_item_id` | text                 | yes  | FK → order_items              |
| `payout_id`     | text                 | yes  | FK → payouts                  |
| `refund_id`     | text                 | yes  | FK → refunds                  |
| `description`   | text                 | yes  |                               |
| `created_by`    | text                 | yes  | FK → users                    |
| `created_at`    | timestamptz(3)       |      | default `now()`               |

Constraints and indexes:

- `@@index([teacher_id, created_at])`

### payouts

| Column             | Type              | Null | Notes                         |
| ------------------ | ----------------- | ---- | ----------------------------- |
| `id`               | text              |      | primary key; default `uuid()` |
| `teacher_id`       | text              |      | FK → users                    |
| `amount_minor`     | bigint            |      |                               |
| `method`           | text              | yes  |                               |
| `transaction_id`   | text              | yes  |                               |
| `period_start`     | date              | yes  |                               |
| `period_end`       | date              | yes  |                               |
| `status`           | enum PayoutStatus |      | default `PENDING`             |
| `recorded_by`      | text              |      | FK → users                    |
| `recorded_at`      | timestamptz(3)    |      | default `now()`               |
| `transfer_date`    | date              | yes  |                               |
| `dispute_deadline` | timestamptz(3)    |      |                               |
| `accepted_at`      | timestamptz(3)    | yes  |                               |

Constraints and indexes:

- `@@index([status, dispute_deadline])`

### payout_disputes

| Column                 | Type               | Null | Notes                         |
| ---------------------- | ------------------ | ---- | ----------------------------- |
| `id`                   | text               |      | primary key; default `uuid()` |
| `payout_id`            | text               |      | FK → payouts                  |
| `teacher_id`           | text               |      | FK → users                    |
| `reason`               | text               |      |                               |
| `status`               | enum DisputeStatus |      | default `OPEN`                |
| `resolution_notes`     | text               | yes  |                               |
| `adjustment_ledger_id` | text               | yes  | FK → teacher_ledger           |
| `created_at`           | timestamptz(3)     |      | default `now()`               |
| `resolved_by`          | text               | yes  | FK → users                    |
| `resolved_at`          | timestamptz(3)     | yes  |                               |

## Progress

### lesson_progress

| Column              | Type                  | Null | Notes                            |
| ------------------- | --------------------- | ---- | -------------------------------- |
| `id`                | text                  |      | primary key; default `uuid()`    |
| `student_id`        | text                  |      | FK → users                       |
| `lesson_id`         | text                  |      | FK → lessons (on delete Cascade) |
| `completed_at`      | timestamptz(3)        |      | default `now()`                  |
| `completion_source` | enum CompletionSource |      |                                  |

Constraints and indexes:

- `@@unique([student_id, lesson_id])`

### video_watch_progress

| Column                  | Type           | Null | Notes                            |
| ----------------------- | -------------- | ---- | -------------------------------- |
| `student_id`            | text           |      | FK → users                       |
| `lesson_id`             | text           |      | FK → lessons (on delete Cascade) |
| `last_position_seconds` | integer        |      | default `0`                      |
| `max_position_seconds`  | integer        |      | default `0`                      |
| `updated_at`            | timestamptz(3) |      |                                  |

Constraints and indexes:

- `@@id([student_id, lesson_id])`

## Platform

### audit_log

| Column          | Type           | Null | Notes                         |
| --------------- | -------------- | ---- | ----------------------------- |
| `id`            | text           |      | primary key; default `uuid()` |
| `actor_user_id` | text           | yes  | FK → users                    |
| `action`        | text           |      |                               |
| `entity_type`   | text           |      |                               |
| `entity_id`     | text           | yes  |                               |
| `details`       | jsonb          | yes  |                               |
| `ip_address`    | text           | yes  |                               |
| `created_at`    | timestamptz(3) |      | default `now()`               |

### platform_settings

| Column       | Type           | Null | Notes       |
| ------------ | -------------- | ---- | ----------- |
| `key`        | text           |      | primary key |
| `value`      | text           |      |             |
| `updated_by` | text           | yes  | FK → users  |
| `updated_at` | timestamptz(3) |      |             |

## Enums

| Enum                | Values                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| UserStatus          | `ACTIVE`, `SUSPENDED`, `DELETED`                                                                  |
| Role                | `ADMIN`, `TEACHER`, `STUDENT`                                                                     |
| ApplicationStatus   | `SUBMITTED`, `UNDER_REVIEW`, `REJECTED`, `HIRED`                                                  |
| CourseStatus        | `DRAFT`, `PENDING_APPROVAL`, `PUBLISHED`, `REJECTED`, `ARCHIVED`                                  |
| ProgressionMode     | `FREE`, `SEQUENTIAL`                                                                              |
| AudienceType        | `STUDENT`, `TEACHER_PD`                                                                           |
| LessonType          | `VIDEO`, `PDF`, `TEXT`, `QUIZ`                                                                    |
| VideoProvider       | `BUNNY`, `YOUTUBE`, `SELF_HOSTED`                                                                 |
| VideoStatus         | `PROCESSING`, `READY`, `FAILED`                                                                   |
| QuestionType        | `MCQ`, `NUMERIC`                                                                                  |
| RevealAnswers       | `NEVER`, `AFTER_ATTEMPT`, `AFTER_PASS`, `AFTER_FINAL_ATTEMPT`                                     |
| EnrollmentStatus    | `ACTIVE`, `REVOKED`, `EXPIRED`                                                                    |
| EnrollmentSource    | `PURCHASE`, `FREE`, `ADMIN_GRANT`                                                                 |
| OrderStatus         | `PENDING`, `PROOF_SUBMITTED`, `VERIFIED`, `REJECTED`, `LAPSED`, `REFUNDED`                        |
| VerificationOutcome | `CONFIRMED`, `REJECTED`                                                                           |
| MismatchAction      | `CONFIRM_ANYWAY`, `REQUEST_TOP_UP`, `REJECT`                                                      |
| RejectionReason     | `NO_PAYMENT_RECEIVED`, `AMOUNT_SHORT`, `INVALID_TRANSACTION_ID`, `DUPLICATE_TRANSACTION`, `OTHER` |
| LedgerEntryType     | `EARNING`, `PAYOUT`, `REFUND`, `ADJUSTMENT`                                                       |
| PayoutStatus        | `PENDING`, `ACCEPTED`, `DISPUTED`, `RESOLVED`                                                     |
| DisputeStatus       | `OPEN`, `RESOLVED`                                                                                |
| CompletionSource    | `AUTO`, `MANUAL`, `QUIZ`                                                                          |
| AuthTokenPurpose    | `EMAIL_VERIFICATION`, `PASSWORD_RESET`, `MFA_CHALLENGE`                                           |
