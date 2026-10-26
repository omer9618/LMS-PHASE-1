# External services: setup

Everything the backend needs from outside providers, and exactly where each value goes. Development needs none of it: the defaults (`log` email, `local` storage, `fake` video, `disabled` captcha) work offline. Production refuses to start until every item below is configured (`src/config/env.schema.ts`).

## Bunny Stream (video, #35–#37)

1. Create a **Stream library** in the bunny.net dashboard.
2. Copy into the environment:

   | Env var                  | Where in the dashboard                                     |
   | ------------------------ | ---------------------------------------------------------- |
   | `BUNNY_LIBRARY_ID`       | Stream > library > API: the numeric Library ID             |
   | `BUNNY_API_KEY`          | Stream > library > API: API Key                            |
   | `BUNNY_READONLY_API_KEY` | Stream > library > API: Read-only API Key (signs webhooks) |
   | `BUNNY_TOKEN_AUTH_KEY`   | Stream > library > Security: Token authentication key      |

   Set `VIDEO_PROVIDER=bunny`.

3. **Security** page of the library:
   - Turn on **Embed view token authentication**. The API signs every player URL; unsigned or expired URLs get 403.
   - **Allowed domains**: add the web app's domain(s), without scheme (e.g. `lms.example.com`). This is #37's "embedding domain-restricted".
   - Turn on **Block direct URL file access**.
4. **Webhook URL** (library > Settings): `https://<api-domain>/webhooks/video/bunny`. Requests are verified with HMAC-SHA256 of the raw body using the read-only key; anything unsigned is rejected with 401.
5. The web app embeds the player with `referrerpolicy="strict-origin-when-cross-origin"` and allows `frame-src https://player.mediadelivery.net` in its CSP.

How it flows: the teacher's browser asks `POST /teacher/courses/:courseId/lessons/:lessonId/video` for TUS credentials and uploads straight to Bunny. Bunny's webhook marks the video ready, and a job every 10 minutes re-checks any video still processing. Playback URLs come from `GET /courses/:courseId/lessons/:lessonId/playback` after the access check, valid for 2 hours.

Formulas used (from bunny.net/docs): TUS signature `sha256(libraryId + apiKey + expires + videoId)`; embed token `sha256(tokenAuthKey + videoId + expires)`, with `expires` in seconds.

## Email (SMTP, #110)

1. Choose any provider with SMTP (Amazon SES, Postmark, Brevo, Mailgun...).
2. `EMAIL_TRANSPORT=smtp`, `SMTP_URL=smtps://user:password@host:465`, `EMAIL_FROM="LMS <no-reply@your-domain>"`.
3. **Before the first send**, on the sending domain's DNS: SPF (provider's include), DKIM (provider's CNAME/TXT records) and DMARC (`_dmarc` TXT, start with `p=none; rua=mailto:...`). #110 is not done until these are in place.

Delivery failures are logged with the template name, the masked recipient and the request id.

## Object storage (S3-compatible, #19, #38)

1. Create a **private** bucket: AWS S3, Cloudflare R2, DigitalOcean Spaces or MinIO. Turn public access off; files are only ever served through signed URLs.
2. Create an access key limited to that bucket (Put, Get, Delete).
3. `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` (`auto` for R2), `S3_ENDPOINT` (R2/Spaces/MinIO only), `S3_FORCE_PATH_STYLE=true` for MinIO.
4. `STORAGE_SIGNING_SECRET` must also be a real random value (`openssl rand -base64 48`).

## Captcha (Cloudflare Turnstile, #18)

1. Cloudflare dashboard > Turnstile > add a widget for the web app's domain.
2. API: `CAPTCHA_PROVIDER=turnstile`, `CAPTCHA_SECRET_KEY=<secret key>`.
3. The web app needs the **site key** to render the widget.

## MFA (#16)

`MFA_ENCRYPTION_KEY`: 32 random bytes, base64 (`openssl rand -base64 32`). It encrypts every enrolled authenticator secret. Losing or changing it means every admin must re-enrol, so store it like the database password.
