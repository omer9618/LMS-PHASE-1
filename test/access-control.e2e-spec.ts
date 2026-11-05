import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ENV } from '../src/config/config.module';
import type { Env } from '../src/config/env.schema';
import { generateOpaqueToken, hashOpaqueToken } from '../src/modules/auth/domain/opaque-token';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { fillPath, registeredRoutes, RegisteredRoute } from './utils/routes';
import { createTestApp } from './utils/test-app';

/**
 * #117: the access-control matrix. Every route the app registers must appear here, with the access
 * it is meant to have; a new route that is not added fails the inventory test, and a route whose
 * decorators drift from its entry fails the metadata test.
 *
 * For every route that needs a session: anonymous → 401.
 * For every role-restricted route: a caller without the role → 403 (and an admin whose session has
 * not passed MFA → 403 MFA_REQUIRED).
 * For every teacher-owned route: another teacher → 404, so existence is not revealed (#14).
 * For every student-owned route: another student → 404.
 */

type Access = 'public' | 'optional' | 'session' | 'teacher' | 'admin';

interface Entry {
  access: Access;
  /** Whose record the route acts on, for the cross-owner 404 check. */
  owned?: 'teacher' | 'student';
  /** A valid body, so validation passes and the ownership check is what answers. */
  body?: object;
  /** Multipart: field name of the file, plus text fields. */
  multipart?: { file: string; fields?: Record<string, string> };
  /** Per-route param overrides (e.g. a lesson of a specific type). */
  params?: Record<string, string>;
  /** Why a route is public, or anything unusual. */
  note?: string;
}

const PUBLIC = (note: string): Entry => ({ access: 'public', note });
const SESSION: Entry = { access: 'session' };
const ADMIN: Entry = { access: 'admin' };
const TEACHER: Entry = { access: 'teacher' };
const teacherOwned = (extra: Omit<Entry, 'access' | 'owned'> = {}): Entry => ({
  access: 'teacher',
  owned: 'teacher',
  ...extra,
});
const studentOwned = (extra: Omit<Entry, 'access' | 'owned'> = {}): Entry => ({
  access: 'session',
  owned: 'student',
  ...extra,
});

const ANY_UUID = '00000000-0000-4000-8000-000000000000';

const MATRIX: Record<string, Entry> = {
  // ── Infrastructure and public reads ───────────────────────────────
  'GET /health': PUBLIC('liveness probe'),
  'GET /dev-files/:token': PUBLIC('local storage only; the signed token is the credential'),
  'GET /boards': PUBLIC('reference data'),
  'GET /boards/:boardId/levels': PUBLIC('reference data'),
  'GET /subjects': PUBLIC('reference data'),
  'GET /catalogue/courses': PUBLIC('catalogue'),
  'GET /catalogue/courses/:courseId': PUBLIC('catalogue'),
  'GET /catalogue/subjects': PUBLIC('catalogue'),
  'POST /webhooks/video/:provider': PUBLIC('provider webhook; HMAC signature is the credential'),
  'POST /teacher-applications': PUBLIC('public application form, captcha-protected'),
  'GET /teachers/:teacherId': PUBLIC('published teacher profile (#99)'),

  // ── Auth and account ──────────────────────────────────────────────
  'POST /auth/login': PUBLIC('sign in'),
  'POST /auth/login/mfa': PUBLIC('second sign-in step; the challenge token is the credential'),
  'POST /auth/logout': PUBLIC('idempotent; clears whatever cookie is sent'),
  'POST /auth/register': PUBLIC('student registration, rate-limited'),
  'POST /auth/verify-email': PUBLIC('emailed single-use token'),
  'POST /auth/password-reset/request': PUBLIC('always answers the same, rate-limited'),
  'POST /auth/password-reset/confirm': PUBLIC('emailed single-use token'),
  'GET /auth/me': SESSION,
  'POST /auth/context': SESSION,
  'POST /auth/verify-email/resend': SESSION,
  'GET /auth/mfa': SESSION,
  'POST /auth/mfa/setup': SESSION,
  'POST /auth/mfa/enable': SESSION,
  'POST /auth/mfa/disable': SESSION,
  'POST /auth/mfa/recovery-codes': SESSION,

  // ── Admin ─────────────────────────────────────────────────────────
  'GET /admin/dashboard': ADMIN,
  'GET /admin/users': ADMIN,
  'GET /admin/users/:userId': ADMIN,
  'GET /admin/users/:userId/overview': ADMIN,
  'POST /admin/users/:userId/password-reset': ADMIN,
  'POST /admin/users': ADMIN,
  'POST /admin/users/:userId/suspend': ADMIN,
  'POST /admin/users/:userId/reactivate': ADMIN,
  'POST /admin/users/:userId/roles': ADMIN,
  'DELETE /admin/users/:userId/roles/:role': ADMIN,
  'GET /admin/audit-log': ADMIN,
  'GET /admin/settings': ADMIN,
  'PUT /admin/settings/:key': ADMIN,
  'GET /admin/courses': ADMIN,
  'GET /admin/courses/:courseId': ADMIN,
  'PATCH /admin/courses/:courseId': ADMIN,
  'GET /admin/courses/:courseId/outline': ADMIN,
  'PUT /admin/courses/:courseId/pricing': ADMIN,
  'POST /admin/courses/:courseId/approve': ADMIN,
  'POST /admin/courses/:courseId/reject': ADMIN,
  'POST /admin/courses/:courseId/unpublish': ADMIN,
  'POST /admin/courses/:courseId/archive': ADMIN,
  'PUT /admin/courses/:courseId/enrollment': ADMIN,
  'GET /admin/courses/:courseId/lessons/:lessonId/quiz': ADMIN,
  'GET /admin/teacher-applications': ADMIN,
  'POST /admin/teacher-applications/purge': ADMIN,
  'GET /admin/teacher-applications/:applicationId': ADMIN,
  'GET /admin/teacher-applications/:applicationId/cv': ADMIN,
  'POST /admin/teacher-applications/:applicationId/review': ADMIN,
  'POST /admin/teacher-applications/:applicationId/account': ADMIN,
  'POST /admin/teacher-applications/:applicationId/link': ADMIN,
  'POST /admin/teachers/:teacherId/deactivate': ADMIN,
  'GET /admin/teachers/:teacherId/profile': ADMIN,
  'PUT /admin/teachers/:teacherId/profile': ADMIN,
  'POST /admin/teachers/:teacherId/profile/unpublish': ADMIN,
  'POST /admin/teachers/:teacherId/profile/photo/remove': ADMIN,
  'GET /admin/teachers/:teacherId/earnings': ADMIN,
  'POST /admin/teachers/:teacherId/ledger/adjustments': ADMIN,
  'POST /admin/teachers/:teacherId/payouts': ADMIN,
  'GET /admin/teachers/:teacherId/payouts': ADMIN,
  'GET /admin/payouts/:payoutId': ADMIN,
  'GET /admin/enrollments': ADMIN,
  'POST /admin/enrollments': ADMIN,
  'POST /admin/enrollments/:enrollmentId/revoke': ADMIN,
  'GET /admin/orders/:orderId': ADMIN,
  'POST /admin/orders/:orderId/refund': ADMIN,
  'GET /admin/verification/queue': ADMIN,
  'GET /admin/verification/metrics': ADMIN,
  'POST /admin/verification/orders/:orderId/confirm': ADMIN,
  'POST /admin/verification/orders/:orderId/reject': ADMIN,

  // ── Teacher: courses and outline ──────────────────────────────────
  'GET /teacher/profile': TEACHER,
  'PUT /teacher/profile': TEACHER,
  'POST /teacher/profile/photo': TEACHER,
  'DELETE /teacher/profile/photo': TEACHER,
  'POST /teacher/profile/publish': TEACHER,
  'POST /teacher/profile/unpublish': TEACHER,
  'GET /teacher/earnings': TEACHER,
  'GET /teacher/ledger': TEACHER,
  'GET /teacher/payouts': TEACHER,
  'GET /teacher/payouts/:payoutId': teacherOwned(),
  'POST /teacher/payouts/:payoutId/concerns': teacherOwned({ body: { reason: 'Short transfer' } }),
  'POST /teacher/courses': TEACHER,
  'GET /teacher/courses': TEACHER,
  'GET /teacher/courses/:courseId': teacherOwned(),
  'PATCH /teacher/courses/:courseId': teacherOwned({ body: { title: 'Hijacked' } }),
  'DELETE /teacher/courses/:courseId': teacherOwned(),
  'POST /teacher/courses/:courseId/submit': teacherOwned({ body: {} }),
  'POST /teacher/courses/:courseId/archive': teacherOwned({ body: {} }),
  'PUT /teacher/courses/:courseId/enrollment': teacherOwned({ body: { open: false } }),
  'GET /teacher/courses/:courseId/outline': teacherOwned(),
  'POST /teacher/courses/:courseId/sections': teacherOwned({ body: { title: 'Injected' } }),
  'PUT /teacher/courses/:courseId/sections/order': teacherOwned({ body: { sectionIds: [] } }),
  'PATCH /teacher/courses/:courseId/sections/:sectionId': teacherOwned({
    body: { title: 'Renamed' },
  }),
  'DELETE /teacher/courses/:courseId/sections/:sectionId': teacherOwned(),
  'POST /teacher/courses/:courseId/sections/:sectionId/lessons': teacherOwned({
    body: { title: 'Injected', type: 'VIDEO' },
  }),
  'PUT /teacher/courses/:courseId/sections/:sectionId/lessons/order': teacherOwned({
    body: { lessonIds: [] },
  }),
  'PATCH /teacher/courses/:courseId/lessons/:lessonId': teacherOwned({
    body: { title: 'Renamed' },
  }),
  'DELETE /teacher/courses/:courseId/lessons/:lessonId': teacherOwned(),
  'POST /teacher/courses/:courseId/lessons/:lessonId/move': teacherOwned({
    body: { sectionId: '<sectionId>', position: 0 },
  }),
  'GET /teacher/courses/:courseId/enrollments': teacherOwned(),
  'GET /teacher/courses/:courseId/progress': teacherOwned(),
  'GET /teacher/courses/:courseId/progress/students/:studentId': teacherOwned(),

  // ── Teacher: content ──────────────────────────────────────────────
  'POST /teacher/courses/:courseId/lessons/:lessonId/video': teacherOwned({
    body: {},
    params: { lessonId: '<videoLessonId>' },
  }),
  'POST /teacher/courses/:courseId/lessons/:lessonId/video/refresh': teacherOwned({
    params: { lessonId: '<videoLessonId>' },
  }),
  'POST /teacher/courses/:courseId/lessons/:lessonId/resources': teacherOwned({
    multipart: { file: 'file' },
    params: { lessonId: '<videoLessonId>' },
  }),
  'DELETE /teacher/courses/:courseId/lessons/:lessonId/resources/:resourceId': teacherOwned({
    params: { lessonId: '<videoLessonId>' },
  }),

  // ── Teacher: quizzes ──────────────────────────────────────────────
  'GET /teacher/courses/:courseId/lessons/:lessonId/quiz': teacherOwned(),
  'POST /teacher/courses/:courseId/lessons/:lessonId/quiz': teacherOwned({ body: {} }),
  'PATCH /teacher/courses/:courseId/lessons/:lessonId/quiz': teacherOwned({
    body: { maxAttempts: 5 },
  }),
  'DELETE /teacher/courses/:courseId/lessons/:lessonId/quiz': teacherOwned(),
  'POST /teacher/courses/:courseId/lessons/:lessonId/quiz/questions': teacherOwned({
    body: { type: 'NUMERIC', contentText: 'Injected?', correctAnswer: '1' },
  }),
  'PUT /teacher/courses/:courseId/lessons/:lessonId/quiz/questions/order': teacherOwned({
    body: { questionIds: [] },
  }),
  'PATCH /teacher/courses/:courseId/lessons/:lessonId/quiz/questions/:questionId': teacherOwned({
    body: { contentText: 'Changed?' },
  }),
  'DELETE /teacher/courses/:courseId/lessons/:lessonId/quiz/questions/:questionId': teacherOwned(),
  'PUT /teacher/courses/:courseId/lessons/:lessonId/quiz/questions/:questionId/image': teacherOwned(
    { multipart: { file: 'file' } },
  ),
  'DELETE /teacher/courses/:courseId/lessons/:lessonId/quiz/questions/:questionId/image':
    teacherOwned(),

  // ── Learners ──────────────────────────────────────────────────────
  'GET /courses/:courseId/lessons/:lessonId/playback': {
    access: 'optional',
    note: 'visitors may play free-preview lessons (the demo); anything else needs a session',
  },
  'GET /courses/:courseId/lessons/:lessonId/content': SESSION,
  'GET /courses/:courseId/lessons/:lessonId/resources/:resourceId/download': SESSION,
  'POST /courses/:courseId/enroll': SESSION,
  'GET /me/enrollments': SESSION,
  'GET /learn/courses/:courseId': SESSION,
  'GET /courses/:courseId/lessons/:lessonId/watch': SESSION,
  'PUT /courses/:courseId/lessons/:lessonId/watch': SESSION,
  'POST /courses/:courseId/lessons/:lessonId/complete': SESSION,
  'GET /courses/:courseId/lessons/:lessonId/quiz': SESSION,
  'POST /courses/:courseId/lessons/:lessonId/quiz/attempts': SESSION,
  'GET /courses/:courseId/lessons/:lessonId/quiz/attempts/:attemptId': studentOwned(),
  'PUT /courses/:courseId/lessons/:lessonId/quiz/attempts/:attemptId/answers': studentOwned({
    body: { answers: [] },
  }),
  'POST /courses/:courseId/lessons/:lessonId/quiz/attempts/:attemptId/submit': studentOwned({
    body: {},
  }),

  // ── Orders ────────────────────────────────────────────────────────
  'POST /cart/quote': SESSION,
  'POST /orders': SESSION,
  'GET /me/orders': SESSION,
  'GET /me/orders/:orderId': studentOwned(),
  'GET /me/orders/:orderId/receipt': studentOwned(),
  'POST /me/orders/:orderId/proofs': studentOwned({
    multipart: { file: 'file', fields: { transactionId: 'TX-ACCESS-MATRIX' } },
  }),
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from('%PDF-1.7\nmatrix\n%%EOF\n', 'latin1');
const PASSWORD = 'access matrix passphrase';

describe('Access-control matrix: every route (#117)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let routes: RegisteredRoute[];
  const http = () => request(app.getHttpServer());

  const cookies: Record<
    'teacherA' | 'teacherB' | 'admin' | 'adminNoMfa' | 'student' | 'otherStudent',
    string
  > = {} as never;
  const params: Record<string, string> = {};
  const placeholders: Record<string, string> = {};

  async function makeStudent(courseId: string) {
    const email = uniqueEmail('matrix');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified: true,
        roles: { create: { role: 'STUDENT' } },
        enrollments: { create: { courseId, source: 'ADMIN_GRANT' } },
      },
    });
    return { id: user.id, cookie: await loginAs(app, { email, password: PASSWORD }) };
  }

  /** An admin session that has not passed MFA (#16). */
  async function adminWithoutMfa(): Promise<string> {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.admin.email } });
    const token = generateOpaqueToken();
    await prisma.session.create({
      data: {
        userId: admin.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return `${app.get<Env>(ENV).SESSION_COOKIE_NAME}=${token}`;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    routes = registeredRoutes(app);

    cookies.teacherA = await loginAs(app, SEEDED.teacherA);
    cookies.teacherB = await loginAs(app, SEEDED.teacherB);
    cookies.admin = await loginAs(app, SEEDED.admin);
    cookies.adminNoMfa = await adminWithoutMfa();

    // Teacher A's course: [Introduction: demo video + PDF], [Assessment: quiz with one question].
    const course = await createCourse(app, cookies.teacherA, await classification(app), 'Matrix');
    let outline = (
      await http()
        .get(`/teacher/courses/${course.id}/outline`)
        .set('Cookie', cookies.teacherA)
        .expect(200)
    ).body.data;
    const videoLessonId = outline.sections[0].lessons[0].id as string;
    const resources = await http()
      .post(`/teacher/courses/${course.id}/lessons/${videoLessonId}/resources`)
      .set('Cookie', cookies.teacherA)
      .attach('file', PDF, { filename: 'notes.pdf', contentType: 'application/pdf' })
      .expect(201);
    const resourceId = resources.body.data[0].id as string;

    outline = (
      await http()
        .post(`/teacher/courses/${course.id}/sections`)
        .set('Cookie', cookies.teacherA)
        .send({ title: 'Assessment' })
        .expect(201)
    ).body.data;
    const sectionId = outline.sections.at(-1).id as string;
    outline = (
      await http()
        .post(`/teacher/courses/${course.id}/sections/${sectionId}/lessons`)
        .set('Cookie', cookies.teacherA)
        .send({ title: 'Checkpoint', type: 'QUIZ' })
        .expect(201)
    ).body.data;
    const quizLessonId = outline.sections.at(-1).lessons.at(-1).id as string;
    await http()
      .post(`/teacher/courses/${course.id}/lessons/${quizLessonId}/quiz`)
      .set('Cookie', cookies.teacherA)
      .send({})
      .expect(201);
    const quiz = await http()
      .post(`/teacher/courses/${course.id}/lessons/${quizLessonId}/quiz/questions`)
      .set('Cookie', cookies.teacherA)
      .send({ type: 'NUMERIC', contentText: 'g in m/s²?', correctAnswer: '9.81' })
      .expect(201);
    const questionId = quiz.body.data.questions[0].id as string;

    // Published directly: the matrix is about access, not the review workflow.
    await prisma.course.update({
      where: { id: course.id },
      data: { status: 'PUBLISHED', isFree: true, publishedAt: new Date() },
    });

    const student = await makeStudent(course.id);
    const otherStudent = await makeStudent(course.id);
    cookies.student = student.cookie;
    cookies.otherStudent = otherStudent.cookie;

    const quizRow = await prisma.quiz.findUniqueOrThrow({ where: { lessonId: quizLessonId } });
    const attempt = await prisma.quizAttempt.create({
      data: { studentId: student.id, quizId: quizRow.id, attemptNumber: 1 },
    });
    const order = await prisma.order.create({
      data: {
        studentId: student.id,
        paymentReference: `MATRIX-${Date.now()}`,
        totalMinor: 150_000n,
        currency: 'PKR',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    Object.assign(params, {
      courseId: course.id,
      sectionId,
      lessonId: quizLessonId,
      resourceId,
      questionId,
      studentId: student.id,
      attemptId: attempt.id,
      orderId: order.id,
      role: 'TEACHER',
      key: 'ORDER_EXPIRY_WINDOW_HOURS',
      provider: 'bunny',
      token: 'not-a-real-token',
    });
    Object.assign(placeholders, { '<videoLessonId>': videoLessonId, '<sectionId>': sectionId });
  });

  afterAll(async () => {
    await app.close();
  });

  const resolve = (value: string) => placeholders[value] ?? value;

  function urlFor(route: RegisteredRoute): string {
    const entry = MATRIX[route.key];
    const overrides = Object.fromEntries(
      Object.entries(entry?.params ?? {}).map(([k, v]) => [k, resolve(v)]),
    );
    return fillPath(route.path, { ...params, ...overrides }, ANY_UUID);
  }

  function bodyFor(entry: Entry): object | undefined {
    if (!entry.body) return undefined;
    return JSON.parse(JSON.stringify(entry.body), (_, v: unknown) =>
      typeof v === 'string' ? resolve(v) : v,
    ) as object;
  }

  function call(route: RegisteredRoute, cookie?: string) {
    const entry = MATRIX[route.key];
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    let req = http()[method](urlFor(route));
    if (cookie) req = req.set('Cookie', cookie);
    if (entry?.multipart) {
      for (const [name, value] of Object.entries(entry.multipart.fields ?? {})) {
        req = req.field(name, value);
      }
      const isPdf = entry.multipart.file === 'file' && route.path.endsWith('/resources');
      return isPdf
        ? req.attach(entry.multipart.file, PDF, {
            filename: 'x.pdf',
            contentType: 'application/pdf',
          })
        : req.attach(entry.multipart.file, PNG, { filename: 'x.png', contentType: 'image/png' });
    }
    const body = entry ? bodyFor(entry) : undefined;
    return body !== undefined ? req.send(body) : req;
  }

  /** "GET /x" → reason, for readable failures. */
  async function collect(
    candidates: RegisteredRoute[],
    cookie: string | undefined,
    expected: number,
    name?: string,
  ): Promise<string[]> {
    const failures: string[] = [];
    for (const route of candidates) {
      const res = await call(route, cookie);
      const okName = !name || res.body?.error?.name === name;
      if (res.status !== expected || !okName) {
        failures.push(
          `${route.key} → ${res.status} ${res.body?.error?.name ?? ''} (expected ${expected}${name ? ` ${name}` : ''})`,
        );
      }
    }
    return failures;
  }

  const byAccess = (...access: Access[]) =>
    routes.filter((r) => access.includes(MATRIX[r.key]?.access));

  describe('inventory', () => {
    it('lists every registered route, and nothing that is not registered', () => {
      const registered = routes.map((r) => r.key);
      const missing = registered.filter((key) => !(key in MATRIX));
      const stale = Object.keys(MATRIX).filter((key) => !registered.includes(key));
      expect({ missing, stale }).toEqual({ missing: [], stale: [] });
      // Sanity: the checks below really run over every group.
      const count = (kind: Access | 'owned') =>
        kind === 'owned'
          ? routes.filter((r) => MATRIX[r.key]?.owned).length
          : byAccess(kind).length;
      expect(registered.length).toBeGreaterThanOrEqual(110);
      expect(count('admin')).toBeGreaterThanOrEqual(30);
      expect(count('teacher')).toBeGreaterThanOrEqual(30);
      expect(count('owned')).toBeGreaterThanOrEqual(35);
    });

    it('matches what Express actually serves (no routes outside Nest controllers)', () => {
      const stack = (
        app.getHttpAdapter().getInstance() as {
          router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
        }
      ).router.stack;
      const served = stack
        // Nest's own catch-all (`{/*splat}`, the ROUTE_NOT_FOUND handler) is not an endpoint.
        .filter((layer) => layer.route && layer.route.path !== '{/*splat}')
        .flatMap((layer) =>
          Object.keys(layer.route!.methods).map((m) => `${m.toUpperCase()} ${layer.route!.path}`),
        )
        .sort();
      expect([...new Set(served)]).toEqual(served);
      expect(served).toEqual(routes.map((r) => r.key).sort());
    });

    it('declares the same access as the route decorators', () => {
      const drift: string[] = [];
      for (const route of routes) {
        const access = MATRIX[route.key]?.access;
        if (!access) continue;
        const actual: Access = route.isPublic
          ? 'public'
          : route.optionalAuth
            ? 'optional'
            : route.roles.length === 0
              ? 'session'
              : route.roles.length === 1 && route.roles[0] === 'ADMIN'
                ? 'admin'
                : route.roles.length === 1 && route.roles[0] === 'TEACHER'
                  ? 'teacher'
                  : ('unknown' as Access);
        if (actual !== access) drift.push(`${route.key}: matrix ${access}, decorators ${actual}`);
      }
      expect(drift).toEqual([]);
    });

    it('allows MFA-less admin sessions only on the routes that need it for enrolment', () => {
      const allowed = routes.filter((r) => r.allowWithoutMfa).map((r) => r.key);
      expect(allowed.sort()).toEqual(
        [
          'GET /auth/me',
          'GET /auth/mfa',
          'POST /auth/mfa/enable',
          'POST /auth/mfa/setup',
          'GET /courses/:courseId/lessons/:lessonId/playback',
        ].sort(),
      );
    });
  });

  describe('authentication', () => {
    it('answers 401 to anonymous callers on every route that needs a session', async () => {
      const failures = await collect(
        byAccess('session', 'teacher', 'admin', 'optional'),
        undefined,
        401,
        'UNAUTHENTICATED',
      );
      expect(failures).toEqual([]);
    });

    it('answers 401 to an expired or unknown session cookie', async () => {
      const cookie = `${app.get<Env>(ENV).SESSION_COOKIE_NAME}=${'a'.repeat(43)}`;
      const failures = await collect(byAccess('session', 'teacher', 'admin'), cookie, 401);
      expect(failures).toEqual([]);
    });

    it('never fails public routes with 401 or a server error', async () => {
      const failures: string[] = [];
      for (const route of byAccess('public')) {
        if (route.key === 'POST /webhooks/video/:provider') continue; // unsigned → 401 by design
        const res = await call(route);
        if (res.status === 401 || res.status >= 500) failures.push(`${route.key} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    });
  });

  describe('roles', () => {
    it('refuses admin routes to students and teachers (403)', async () => {
      const admin = byAccess('admin');
      expect(await collect(admin, cookies.student, 403, 'FORBIDDEN')).toEqual([]);
      expect(await collect(admin, cookies.teacherA, 403, 'FORBIDDEN')).toEqual([]);
    });

    it('refuses admin routes to an admin session without MFA (403 MFA_REQUIRED)', async () => {
      expect(await collect(byAccess('admin'), cookies.adminNoMfa, 403, 'MFA_REQUIRED')).toEqual([]);
    });

    it('refuses teacher routes to students and to admins without the teacher role (403)', async () => {
      const teacher = byAccess('teacher');
      expect(await collect(teacher, cookies.student, 403, 'FORBIDDEN')).toEqual([]);
      expect(await collect(teacher, cookies.admin, 403, 'FORBIDDEN')).toEqual([]);
    });
  });

  describe('ownership', () => {
    const owned = (kind: 'teacher' | 'student') =>
      routes.filter((r) => MATRIX[r.key]?.owned === kind);

    it('answers 404 to another teacher on every teacher-owned route (#14)', async () => {
      expect(await collect(owned('teacher'), cookies.teacherB, 404, 'NOT_FOUND')).toEqual([]);
    });

    it('answers 404 to another student on every student-owned route', async () => {
      expect(await collect(owned('student'), cookies.otherStudent, 404, 'NOT_FOUND')).toEqual([]);
    });

    it('serves the owner (control: the 404s above are about ownership, not missing records)', async () => {
      const failures: string[] = [];
      const reads = [...owned('teacher'), ...owned('student')].filter((r) => r.method === 'GET');
      for (const route of reads) {
        const owner = MATRIX[route.key].owned === 'teacher' ? cookies.teacherA : cookies.student;
        const res = await call(route, owner);
        if (res.status === 404) failures.push(`${route.key} → 404 for its owner`);
      }
      expect(failures).toEqual([]);
    });

    it('left teacher A’s course untouched', async () => {
      const course = await prisma.course.findUniqueOrThrow({
        where: { id: params.courseId },
        select: { title: true, isEnrollmentOpen: true, status: true },
      });
      expect(course).toEqual({ title: 'Matrix', isEnrollmentOpen: true, status: 'PUBLISHED' });
      expect(await prisma.lessonResource.count({ where: { id: params.resourceId } })).toBe(1);
      expect(await prisma.question.count({ where: { id: params.questionId } })).toBe(1);
    });
  });
});
