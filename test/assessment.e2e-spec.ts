import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { AssessmentService } from '../src/modules/assessment/services/assessment.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake image body for a diagram'),
]);
const PDF = Buffer.from('%PDF-1.7\nnot an image\n%%EOF\n', 'latin1');
const STUDENT_PASSWORD = 'student passphrase for quizzes';

describe('Assessment: quiz builder and attempts (#68–#74, #76)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let otherTeacher: string;
  let admin: string;
  let prisma: PrismaService;
  let ids: Classification;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    otherTeacher = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    prisma = app.get(PrismaService);
    ids = await classification(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function quizLesson(courseId: string, isFreePreview = false): Promise<string> {
    const outline = await http()
      .post(`/teacher/courses/${courseId}/sections`)
      .set('Cookie', teacher)
      .send({ title: 'Quizzes' })
      .expect(201);
    const sectionId = outline.body.data.sections.at(-1).id;
    const res = await http()
      .post(`/teacher/courses/${courseId}/sections/${sectionId}/lessons`)
      .set('Cookie', teacher)
      .send({ title: 'Check your understanding', type: 'QUIZ', isFreePreview })
      .expect(201);
    return res.body.data.sections.at(-1).lessons.at(-1).id as string;
  }

  async function publish(courseId: string) {
    await http().post(`/teacher/courses/${courseId}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${courseId}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${courseId}/approve`).set('Cookie', admin).expect(200);
  }

  async function student(enrolledIn?: string): Promise<{ id: string; cookie: string }> {
    const email = uniqueEmail('quiz-taker');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(STUDENT_PASSWORD),
        isEmailVerified: true,
        roles: { create: { role: 'STUDENT' } },
      },
    });
    if (enrolledIn) {
      await prisma.enrollment.create({
        data: { studentId: user.id, courseId: enrolledIn, source: 'ADMIN_GRANT' },
      });
    }
    return { id: user.id, cookie: await loginAs(app, { email, password: STUDENT_PASSWORD }) };
  }

  const MCQ = {
    type: 'MCQ',
    contentText: 'What is $\\frac{d}{dx} x^2$?',
    options: [
      { text: '$x$', isCorrect: false },
      { text: '$2x$', isCorrect: true },
      { text: '$x^3/3$', isCorrect: false },
    ],
    marks: 2,
    explanation: 'Power rule: $$\\frac{d}{dx} x^n = n x^{n-1}$$',
  };
  const NUMERIC = {
    type: 'NUMERIC',
    contentText: 'Acceleration due to gravity?',
    correctAnswer: '9.81',
    tolerance: '0.05',
    unit: 'm/s²',
    explanation: 'Standard gravity.',
  };

  /** A published free course with a quiz lesson holding an MCQ (2 marks) and a numeric question. */
  async function setup(settings: Record<string, unknown> = {}, isFreePreview = false) {
    const course = await createCourse(app, teacher, ids, `Quiz course ${Date.now()}`);
    const lessonId = await quizLesson(course.id, isFreePreview);
    const base = `/teacher/courses/${course.id}/lessons/${lessonId}/quiz`;
    await http().post(base).set('Cookie', teacher).send(settings).expect(201);
    await http().post(`${base}/questions`).set('Cookie', teacher).send(MCQ).expect(201);
    const quiz = (
      await http().post(`${base}/questions`).set('Cookie', teacher).send(NUMERIC).expect(201)
    ).body.data;
    await publish(course.id);
    const [mcq, numeric] = quiz.questions;
    const correctOption = mcq.options.find((o: { isCorrect: boolean }) => o.isCorrect).id;
    const wrongOption = mcq.options.find((o: { isCorrect: boolean }) => !o.isCorrect).id;
    return {
      courseId: course.id,
      lessonId,
      quizId: quiz.id as string,
      builder: base,
      taking: `/courses/${course.id}/lessons/${lessonId}/quiz`,
      mcqId: mcq.id as string,
      numericId: numeric.id as string,
      correctOption: correctOption as string,
      wrongOption: wrongOption as string,
    };
  }

  describe('builder (#68–#71)', () => {
    it('creates, edits, reorders and deletes a quiz with MCQ and numeric questions', async () => {
      const course = await createCourse(app, teacher, ids, 'Builder course');
      const lessonId = await quizLesson(course.id);
      const base = `/teacher/courses/${course.id}/lessons/${lessonId}/quiz`;

      await http().get(base).set('Cookie', teacher).expect(404);
      const created = await http()
        .post(base)
        .set('Cookie', teacher)
        .send({ timeLimitSeconds: 600, maxAttempts: 3 })
        .expect(201);
      expect(created.body.data).toMatchObject({
        lessonId,
        timeLimitSeconds: 600,
        maxAttempts: 3,
        isBreakpoint: false,
        revealAnswers: 'AFTER_ATTEMPT',
        questions: [],
        attemptCount: 0,
      });
      await http().post(base).set('Cookie', teacher).send({}).expect(409);

      await http().post(`${base}/questions`).set('Cookie', teacher).send(MCQ).expect(201);
      const withBoth = await http()
        .post(`${base}/questions`)
        .set('Cookie', teacher)
        .send(NUMERIC)
        .expect(201);
      const [mcq, numeric] = withBoth.body.data.questions;
      // #71: notation is stored and returned exactly as written.
      expect(mcq).toMatchObject({
        type: 'MCQ',
        contentText: MCQ.contentText,
        explanation: MCQ.explanation,
        marks: 2,
        orderIndex: 0,
        imageUrl: null,
      });
      expect(mcq.options.map((o: { text: string }) => o.text)).toEqual(['$x$', '$2x$', '$x^3/3$']);
      expect(mcq.correctAnswer).toBe(mcq.options[1].id);
      expect(numeric).toMatchObject({
        type: 'NUMERIC',
        correctAnswer: '9.81',
        numericTolerance: '0.05',
        numericUnit: 'm/s²',
        options: null,
        orderIndex: 1,
      });
      expect(withBoth.body.data.totalMarks).toBe(3);

      // Edit: option ids stay stable; the correct option changes.
      const edited = await http()
        .patch(`${base}/questions/${mcq.id}`)
        .set('Cookie', teacher)
        .send({
          options: [
            { id: mcq.options[0].id, text: '$x$', isCorrect: true },
            { id: mcq.options[1].id, text: '$2x$', isCorrect: false },
          ],
        })
        .expect(200);
      expect(edited.body.data.questions[0].correctAnswer).toBe(mcq.options[0].id);
      await http()
        .patch(`${base}/questions/${numeric.id}`)
        .set('Cookie', teacher)
        .send({ tolerance: '0.1', unit: null })
        .expect(200)
        .expect((res) =>
          expect(res.body.data.questions[1]).toMatchObject({
            numericTolerance: '0.1',
            numericUnit: null,
          }),
        );
      // Wrong-type fields and bad decimals are refused.
      await http()
        .patch(`${base}/questions/${mcq.id}`)
        .set('Cookie', teacher)
        .send({ correctAnswer: '1' })
        .expect(400);
      await http()
        .post(`${base}/questions`)
        .set('Cookie', teacher)
        .send({ ...NUMERIC, correctAnswer: '9,81' })
        .expect(400);
      await http()
        .post(`${base}/questions`)
        .set('Cookie', teacher)
        .send({ ...NUMERIC, correctAnswer: 9.81 })
        .expect(400);

      const reordered = await http()
        .put(`${base}/questions/order`)
        .set('Cookie', teacher)
        .send({ questionIds: [numeric.id, mcq.id] })
        .expect(200);
      expect(reordered.body.data.questions.map((q: { id: string }) => q.id)).toEqual([
        numeric.id,
        mcq.id,
      ]);
      await http()
        .put(`${base}/questions/order`)
        .set('Cookie', teacher)
        .send({ questionIds: [numeric.id] })
        .expect(400);

      // Settings: a checkpoint needs a passing score (also a DB CHECK).
      await http().patch(base).set('Cookie', teacher).send({ isBreakpoint: true }).expect(400);
      await http()
        .patch(base)
        .set('Cookie', teacher)
        .send({ isBreakpoint: true, passingScorePct: 70, revealAnswers: 'AFTER_PASS' })
        .expect(200)
        .expect((res) =>
          expect(res.body.data).toMatchObject({ isBreakpoint: true, passingScorePct: 70 }),
        );

      const afterDelete = await http()
        .delete(`${base}/questions/${numeric.id}`)
        .set('Cookie', teacher)
        .expect(200);
      expect(afterDelete.body.data.questions).toHaveLength(1);
      expect(afterDelete.body.data.questions[0].orderIndex).toBe(0);

      await http().delete(base).set('Cookie', teacher).expect(200);
      await http().get(base).set('Cookie', teacher).expect(404);
    });

    it('only adds quizzes to quiz lessons', async () => {
      const course = await createCourse(app, teacher, ids, 'Video only');
      const outline = await http()
        .get(`/teacher/courses/${course.id}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const videoLesson = outline.body.data.sections[0].lessons[0].id;
      await http()
        .post(`/teacher/courses/${course.id}/lessons/${videoLesson}/quiz`)
        .set('Cookie', teacher)
        .send({})
        .expect(400);
    });

    it('scopes the builder: other teacher 404, student 403, anonymous 401; admins can read', async () => {
      const q = await setup();
      const { cookie } = await student(q.courseId);
      await http().get(q.builder).set('Cookie', otherTeacher).expect(404);
      await http()
        .patch(q.builder)
        .set('Cookie', otherTeacher)
        .send({ maxAttempts: 9 })
        .expect(404);
      await http().post(`${q.builder}/questions`).set('Cookie', otherTeacher).send(MCQ).expect(404);
      await http()
        .delete(`${q.builder}/questions/${q.mcqId}`)
        .set('Cookie', otherTeacher)
        .expect(404);
      await http().get(q.builder).set('Cookie', cookie).expect(403);
      await http().get(q.builder).expect(401);

      const adminView = await http()
        .get(`/admin/courses/${q.courseId}/lessons/${q.lessonId}/quiz`)
        .set('Cookie', admin)
        .expect(200);
      expect(adminView.body.data.questions).toHaveLength(2);
      await http()
        .get(`/admin/courses/${q.courseId}/lessons/${q.lessonId}/quiz`)
        .set('Cookie', teacher)
        .expect(403);
    });

    it('locks quiz content while the course awaits approval', async () => {
      const course = await createCourse(app, teacher, ids, 'Pending quiz course');
      const lessonId = await quizLesson(course.id);
      const base = `/teacher/courses/${course.id}/lessons/${lessonId}/quiz`;
      await http().post(base).set('Cookie', teacher).send({}).expect(201);
      await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
      await http().post(`${base}/questions`).set('Cookie', teacher).send(MCQ).expect(409);
      await http().get(base).set('Cookie', teacher).expect(200);
    });

    it('refuses to delete a quiz or an answered question once students have attempted it', async () => {
      const q = await setup();
      const { cookie } = await student(q.courseId);
      const attempt = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
      await http()
        .post(`${q.taking}/attempts/${attempt.body.data.id}/submit`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);

      const quiz = await http().get(q.builder).set('Cookie', teacher).expect(200);
      expect(quiz.body.data.attemptCount).toBe(1);
      await http()
        .delete(q.builder)
        .set('Cookie', teacher)
        .expect(409)
        .expect((res) => expect(res.body.error.name).toBe('QUIZ_LOCKED'));
      await http().delete(`${q.builder}/questions/${q.mcqId}`).set('Cookie', teacher).expect(409);
      // Settings and wording stay editable.
      await http().patch(q.builder).set('Cookie', teacher).send({ maxAttempts: 5 }).expect(200);
    });
  });

  describe('question images (#72)', () => {
    it('stores images by content type and serves signed URLs only to people allowed to take the quiz', async () => {
      const q = await setup();
      await http()
        .put(`${q.builder}/questions/${q.mcqId}/image`)
        .set('Cookie', teacher)
        .attach('file', PDF, { filename: 'diagram.png', contentType: 'image/png' })
        .expect(400)
        .expect((res) => expect(res.body.error.name).toBe('UPLOAD_REJECTED'));
      await http()
        .put(`${q.builder}/questions/${q.mcqId}/image`)
        .set('Cookie', otherTeacher)
        .attach('file', PNG, { filename: 'diagram.png', contentType: 'image/png' })
        .expect(404);
      const withImage = await http()
        .put(`${q.builder}/questions/${q.mcqId}/image`)
        .set('Cookie', teacher)
        .attach('file', PNG, { filename: 'diagram.png', contentType: 'image/png' })
        .expect(200);
      const teacherUrl: string = withImage.body.data.questions[0].imageUrl;
      expect(teacherUrl).toContain('/dev-files/');
      const stored = await prisma.question.findUniqueOrThrow({ where: { id: q.mcqId } });
      expect(stored.contentImageUrl).toMatch(/^questions\/.+\.png$/);
      expect(JSON.stringify(withImage.body)).not.toContain(stored.contentImageUrl);

      // Enrolled student: the attempt carries a working signed URL.
      const enrolled = await student(q.courseId);
      const attempt = await http()
        .post(`${q.taking}/attempts`)
        .set('Cookie', enrolled.cookie)
        .expect(201);
      const url: string = attempt.body.data.questions[0].imageUrl;
      const file = await http().get(new URL(url).pathname).expect(200);
      expect(Buffer.from(file.body as Buffer).subarray(0, 8)).toEqual(PNG.subarray(0, 8));

      // Not enrolled: no attempt, so no image URL.
      const outsider = await student();
      await http().post(`${q.taking}/attempts`).set('Cookie', outsider.cookie).expect(403);

      const removed = await http()
        .delete(`${q.builder}/questions/${q.mcqId}/image`)
        .set('Cookie', teacher)
        .expect(200);
      expect(removed.body.data.questions[0].imageUrl).toBeNull();
    });
  });

  describe('taking a quiz (#69, #70, #73, #74)', () => {
    it('start → save → resume → submit, with answers hidden until the reveal rule allows', async () => {
      const q = await setup({ passingScorePct: 60 });
      const { cookie } = await student(q.courseId);

      const overview = await http().get(q.taking).set('Cookie', cookie).expect(200);
      expect(overview.body.data).toMatchObject({
        questionCount: 2,
        totalMarks: 3,
        attemptsUsed: 0,
        attemptsRemaining: null,
        hasPassed: false,
        openAttemptId: null,
      });
      expect(overview.body.data.questions).toBeUndefined();

      const started = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
      const attempt = started.body.data;
      expect(attempt).toMatchObject({
        attemptNumber: 1,
        status: 'IN_PROGRESS',
        deadline: null,
        answersRevealed: false,
      });
      const body = JSON.stringify(started.body);
      for (const secret of ['correctAnswer', 'isCorrect', 'explanation', 'numericTolerance']) {
        expect(body).not.toContain(secret);
      }
      expect(attempt.questions[0].options).toHaveLength(3);
      expect(attempt.questions[1]).toMatchObject({ type: 'NUMERIC', numericUnit: 'm/s²' });

      const saved = await http()
        .put(`${q.taking}/attempts/${attempt.id}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);
      expect(saved.body.data.questions[0].yourAnswer).toBe(q.correctOption);
      // Invalid answers are refused.
      await http()
        .put(`${q.taking}/attempts/${attempt.id}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.numericId, answer: '9.8 m/s' }] })
        .expect(400);
      await http()
        .put(`${q.taking}/attempts/${attempt.id}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: 'not-an-option' }] })
        .expect(400);

      // Starting again resumes the attempt in progress.
      const resumed = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
      expect(resumed.body.data.id).toBe(attempt.id);
      expect(resumed.body.data.questions[0].yourAnswer).toBe(q.correctOption);

      // Another student cannot see or touch it.
      const other = await student(q.courseId);
      await http()
        .get(`${q.taking}/attempts/${attempt.id}`)
        .set('Cookie', other.cookie)
        .expect(404);

      // 9.76 is inside 9.81 ± 0.05: full marks.
      const submitted = await http()
        .post(`${q.taking}/attempts/${attempt.id}/submit`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.numericId, answer: '9.76' }] })
        .expect(200);
      expect(submitted.body.data).toMatchObject({
        status: 'SUBMITTED',
        scorePct: 100,
        isPassed: true,
        timedOut: false,
        answersRevealed: true,
      });
      expect(submitted.body.data.questions[0]).toMatchObject({
        isCorrect: true,
        marksAwarded: 2,
        correctAnswer: q.correctOption,
        explanation: MCQ.explanation,
      });
      expect(submitted.body.data.questions[1]).toMatchObject({
        yourAnswer: '9.76',
        isCorrect: true,
        correctAnswer: '9.81',
        numericTolerance: '0.05',
      });

      // Every question has a recorded response.
      const responses = await prisma.questionResponse.findMany({
        where: { attemptId: attempt.id },
      });
      expect(responses).toHaveLength(2);
      expect(
        await prisma.quizAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
      ).toMatchObject({ scorePct: 100, isPassed: true });

      // A closed attempt takes no more answers; submitting again returns the result.
      await http()
        .put(`${q.taking}/attempts/${attempt.id}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.wrongOption }] })
        .expect(409)
        .expect((res) => expect(res.body.error.name).toBe('QUIZ_ATTEMPT_CLOSED'));
      await http()
        .post(`${q.taking}/attempts/${attempt.id}/submit`)
        .set('Cookie', cookie)
        .send({})
        .expect(200)
        .expect((res) => expect(res.body.data.scorePct).toBe(100));
    });

    it('enforces the time limit on server time: late answers are ignored and an expired attempt closes when touched', async () => {
      const q = await setup({ timeLimitSeconds: 60 });
      const { cookie } = await student(q.courseId);
      const started = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
      const attemptId = started.body.data.id;
      const startedAt = new Date(started.body.data.startedAt).getTime();
      expect(new Date(started.body.data.deadline).getTime()).toBe(startedAt + 60_000);
      // The client counts down from the server's clock, never its own.
      expect(Math.abs(new Date(started.body.data.serverTime).getTime() - Date.now())).toBeLessThan(
        5_000,
      );

      await http()
        .put(`${q.taking}/attempts/${attemptId}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);

      // Fake the passage of time: the attempt began 5 minutes ago.
      await prisma.quizAttempt.update({
        where: { id: attemptId },
        data: { startedAt: new Date(Date.now() - 5 * 60_000) },
      });

      await http()
        .put(`${q.taking}/attempts/${attemptId}/answers`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.numericId, answer: '9.81' }] })
        .expect(409)
        .expect((res) => expect(res.body.error.name).toBe('QUIZ_ATTEMPT_CLOSED'));

      const result = await http()
        .get(`${q.taking}/attempts/${attemptId}`)
        .set('Cookie', cookie)
        .expect(200);
      // Only the MCQ (2 of 3 marks) saved before the deadline counts.
      expect(result.body.data).toMatchObject({ status: 'SUBMITTED', scorePct: 66, timedOut: true });
      expect(result.body.data.questions[1].yourAnswer).toBeNull();
    });

    it('ignores answers sent with a late submit, and closes abandoned attempts on the next start', async () => {
      const q = await setup({ timeLimitSeconds: 60, maxAttempts: 3 });
      const { cookie } = await student(q.courseId);
      const first = (await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201))
        .body.data;
      await prisma.quizAttempt.update({
        where: { id: first.id },
        data: { startedAt: new Date(Date.now() - 61_000 - 16_000) },
      });
      const late = await http()
        .post(`${q.taking}/attempts/${first.id}/submit`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);
      expect(late.body.data).toMatchObject({ scorePct: 0, timedOut: true });

      // Within the 15 s grace, a submit still counts.
      const second = (await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201))
        .body.data;
      expect(second.attemptNumber).toBe(2);
      await prisma.quizAttempt.update({
        where: { id: second.id },
        data: { startedAt: new Date(Date.now() - 65_000) },
      });
      const inGrace = await http()
        .post(`${q.taking}/attempts/${second.id}/submit`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);
      expect(inGrace.body.data).toMatchObject({ scorePct: 66, timedOut: false });

      // Abandoned third attempt: closed when the student next starts, and the limit applies.
      const third = (await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201))
        .body.data;
      await prisma.quizAttempt.update({
        where: { id: third.id },
        data: { startedAt: new Date(Date.now() - 10 * 60_000) },
      });
      await http()
        .post(`${q.taking}/attempts`)
        .set('Cookie', cookie)
        .expect(409)
        .expect((res) => expect(res.body.error.name).toBe('QUIZ_ATTEMPT_REFUSED'));
      const overview = await http().get(q.taking).set('Cookie', cookie).expect(200);
      expect(overview.body.data).toMatchObject({
        attemptsUsed: 3,
        attemptsRemaining: 0,
        openAttemptId: null,
      });
      expect(overview.body.data.attempts.map((a: { status: string }) => a.status)).toEqual([
        'SUBMITTED',
        'SUBMITTED',
        'SUBMITTED',
      ]);
    });

    it('enforces max attempts with sequential numbers', async () => {
      const q = await setup({ maxAttempts: 2 });
      const { cookie } = await student(q.courseId);
      for (const n of [1, 2]) {
        const a = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
        expect(a.body.data.attemptNumber).toBe(n);
        await http()
          .post(`${q.taking}/attempts/${a.body.data.id}/submit`)
          .set('Cookie', cookie)
          .send({})
          .expect(200);
      }
      await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(409);
    });

    it('controls access: enrolment, free preview, staff, roles and anonymity', async () => {
      const q = await setup();
      const outsider = await student();
      await http()
        .post(`${q.taking}/attempts`)
        .set('Cookie', outsider.cookie)
        .expect(403)
        .expect((res) => expect(res.body.error.name).toBe('ENROLLMENT_REQUIRED'));
      await http().get(q.taking).expect(401);
      await http()
        .post(`${q.taking}/attempts`)
        .set('Cookie', teacher)
        .expect(403)
        .expect((res) => expect(res.body.error.info.reason).toBe('STAFF_PREVIEW'));
      await http().get(q.taking).set('Cookie', teacher).expect(200);
      // Another teacher is not staff on this course and not enrolled.
      await http().post(`${q.taking}/attempts`).set('Cookie', otherTeacher).expect(403);

      // A free-preview quiz lesson can be taken by any signed-in user.
      const preview = await setup({}, true);
      await http().post(`${preview.taking}/attempts`).set('Cookie', outsider.cookie).expect(201);
    });
  });

  describe('reveal rules (#76)', () => {
    async function takeAndSubmit(
      q: Awaited<ReturnType<typeof setup>>,
      cookie: string,
      answer: string,
    ) {
      const a = await http().post(`${q.taking}/attempts`).set('Cookie', cookie).expect(201);
      return http()
        .post(`${q.taking}/attempts/${a.body.data.id}/submit`)
        .set('Cookie', cookie)
        .send({ answers: [{ questionId: q.mcqId, answer }] })
        .expect(200);
    }

    it('NEVER shows only the score', async () => {
      const q = await setup({ revealAnswers: 'NEVER' });
      const { cookie } = await student(q.courseId);
      const res = await takeAndSubmit(q, cookie, q.correctOption);
      expect(res.body.data).toMatchObject({ scorePct: 66, answersRevealed: false });
      expect(JSON.stringify(res.body)).not.toContain('correctAnswer');
      expect(JSON.stringify(res.body)).not.toContain('explanation');
    });

    it('AFTER_PASS reveals once the student has passed', async () => {
      const q = await setup({ revealAnswers: 'AFTER_PASS', passingScorePct: 60 });
      const { cookie } = await student(q.courseId);
      const failed = await takeAndSubmit(q, cookie, q.wrongOption);
      expect(failed.body.data).toMatchObject({ isPassed: false, answersRevealed: false });
      const passed = await takeAndSubmit(q, cookie, q.correctOption);
      expect(passed.body.data).toMatchObject({ isPassed: true, answersRevealed: true });
      // Earlier attempts are revealed too, once passed.
      const first = await http()
        .get(`${q.taking}/attempts/${failed.body.data.id}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(first.body.data.answersRevealed).toBe(true);
    });

    it('AFTER_FINAL_ATTEMPT reveals only when no attempts remain', async () => {
      const q = await setup({ revealAnswers: 'AFTER_FINAL_ATTEMPT', maxAttempts: 2 });
      const { cookie } = await student(q.courseId);
      const one = await takeAndSubmit(q, cookie, q.correctOption);
      expect(one.body.data.answersRevealed).toBe(false);
      const two = await takeAndSubmit(q, cookie, q.wrongOption);
      expect(two.body.data.answersRevealed).toBe(true);
      expect(two.body.data.questions[0].correctAnswer).toBe(q.correctOption);
    });
  });

  describe('AssessmentService for checkpoint gating (#77)', () => {
    it('reports passed, submitted and checkpoint quiz lessons, closing expired attempts first', async () => {
      const q = await setup({ isBreakpoint: true, passingScorePct: 50, timeLimitSeconds: 60 });
      const s = await student(q.courseId);
      const service = app.get(AssessmentService);

      expect(await service.breakpointQuizLessonIds(q.courseId)).toEqual(new Set([q.lessonId]));
      expect((await service.passedQuizLessonIds(s.id, q.courseId)).size).toBe(0);

      const a = await http().post(`${q.taking}/attempts`).set('Cookie', s.cookie).expect(201);
      await http()
        .put(`${q.taking}/attempts/${a.body.data.id}/answers`)
        .set('Cookie', s.cookie)
        .send({ answers: [{ questionId: q.mcqId, answer: q.correctOption }] })
        .expect(200);
      expect(await service.submittedQuizLessonIds(s.id, q.courseId)).toEqual(new Set());

      // Abandoned past its deadline: graded on the saved answer (2 of 3 marks, passes at 50%).
      await prisma.quizAttempt.update({
        where: { id: a.body.data.id },
        data: { startedAt: new Date(Date.now() - 10 * 60_000) },
      });
      expect([...(await service.passedQuizLessonIds(s.id, q.courseId)).keys()]).toEqual([
        q.lessonId,
      ]);
      expect(await service.submittedQuizLessonIds(s.id, q.courseId)).toEqual(new Set([q.lessonId]));
    });
  });
});
