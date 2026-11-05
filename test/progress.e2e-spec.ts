import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const STUDENT_PASSWORD = 'student passphrase for progress';

interface Lesson {
  id: string;
  title: string;
  state: string;
  lock: { cause: string; blockingLessonId: string; message: string } | null;
  completion: { source: string } | null;
  resumePositionSeconds: number | null;
}

describe('Progress, sequential unlock and checkpoints (#90–#97, #77)', () => {
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

  async function addLesson(
    courseId: string,
    sectionId: string,
    title: string,
    type: 'VIDEO' | 'TEXT' | 'QUIZ',
    extra: { durationSeconds?: number; checkpoint?: boolean } = {},
  ): Promise<string> {
    const res = await http()
      .post(`/teacher/courses/${courseId}/sections/${sectionId}/lessons`)
      .set('Cookie', teacher)
      .send({ title, type, ...(type === 'TEXT' ? { bodyText: 'Read this.' } : {}) })
      .expect(201);
    const lesson = res.body.data.sections
      .find((s: { id: string }) => s.id === sectionId)
      .lessons.at(-1);
    if (type === 'VIDEO') {
      const asset = await prisma.videoAsset.create({
        data: {
          provider: 'SELF_HOSTED',
          providerVideoId: `progress-${lesson.id}`,
          status: 'READY',
          durationSeconds: extra.durationSeconds ?? 100,
        },
      });
      await prisma.lesson.update({ where: { id: lesson.id }, data: { videoAssetId: asset.id } });
    }
    if (type === 'QUIZ') {
      // The assessment module's endpoints may not exist yet: quizzes are inserted directly.
      await prisma.quiz.create({
        data: { lessonId: lesson.id, isBreakpoint: extra.checkpoint ?? false, passingScorePct: 60 },
      });
    }
    return lesson.id as string;
  }

  /**
   * A published course: [Introduction: welcome (free-preview video)], [Unit 1: v1 (video 100 s),
   * t1 (text), quiz (checkpoint), v2 (video)].
   */
  async function buildCourse(mode: 'FREE' | 'SEQUENTIAL', title: string) {
    const course = await createCourse(app, teacher, ids, title);
    await http()
      .patch(`/teacher/courses/${course.id}`)
      .set('Cookie', teacher)
      .send({ progressionMode: mode })
      .expect(200);
    const outline = await http()
      .post(`/teacher/courses/${course.id}/sections`)
      .set('Cookie', teacher)
      .send({ title: 'Unit 1' })
      .expect(201);
    const welcome = outline.body.data.sections[0].lessons[0].id as string;
    const sectionId = outline.body.data.sections.at(-1).id as string;
    const v1 = await addLesson(course.id, sectionId, 'Forces video', 'VIDEO');
    const t1 = await addLesson(course.id, sectionId, 'Forces notes', 'TEXT');
    const quiz = await addLesson(course.id, sectionId, 'Forces checkpoint', 'QUIZ', {
      checkpoint: true,
    });
    const v2 = await addLesson(course.id, sectionId, 'Momentum video', 'VIDEO');

    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return { courseId: course.id, welcome, v1, t1, quiz, v2 };
  }

  async function student(enrolledIn?: string) {
    const email = uniqueEmail('progress');
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

  async function outline(courseId: string, cookie: string) {
    const res = await http().get(`/learn/courses/${courseId}`).set('Cookie', cookie).expect(200);
    const lessons = new Map<string, Lesson>();
    for (const section of res.body.data.sections) {
      for (const lesson of section.lessons) lessons.set(lesson.id, lesson);
    }
    return { data: res.body.data, lessons };
  }

  async function passQuiz(studentId: string, lessonId: string, isPassed = true, attempt = 1) {
    const quiz = await prisma.quiz.findUniqueOrThrow({ where: { lessonId } });
    await prisma.quizAttempt.create({
      data: {
        studentId,
        quizId: quiz.id,
        attemptNumber: attempt,
        scorePct: isPassed ? 80 : 40,
        isPassed,
        submittedAt: new Date(),
      },
    });
  }

  /** Pretend the previous watch report was `seconds` ago. */
  async function backdateWatch(studentId: string, lessonId: string, seconds: number) {
    await prisma.videoWatchProgress.update({
      where: { studentId_lessonId: { studentId, lessonId } },
      data: { updatedAt: new Date(Date.now() - seconds * 1000) },
    });
  }

  describe('a SEQUENTIAL course with a checkpoint', () => {
    let c: Awaited<ReturnType<typeof buildCourse>>;
    let learner: { id: string; cookie: string };

    beforeAll(async () => {
      c = await buildCourse('SEQUENTIAL', 'Sequential physics');
      learner = await student(c.courseId);
    });

    it('starts with only the first lesson open, and explains every lock (#96, #97)', async () => {
      const { data, lessons } = await outline(c.courseId, learner.cookie);
      expect(data).toMatchObject({
        viewer: 'STUDENT',
        progressionMode: 'SEQUENTIAL',
        currentLessonId: c.welcome,
        completedLessons: 0,
        totalLessons: 5,
        completionPercent: 0,
      });
      expect(lessons.get(c.welcome)!.state).toBe('AVAILABLE');
      expect(lessons.get(c.v1)!.lock).toMatchObject({
        cause: 'PREVIOUS_LESSON_INCOMPLETE',
        blockingLessonId: c.welcome,
      });
      // Behind the checkpoint, the checkpoint is the reported cause (it takes precedence).
      expect(lessons.get(c.v2)!.lock).toMatchObject({
        cause: 'CHECKPOINT_NOT_PASSED',
        blockingLessonId: c.quiz,
      });
    });

    it('refuses playback, watch reports and completion of a locked lesson (#96)', async () => {
      const playback = await http()
        .get(`/courses/${c.courseId}/lessons/${c.v1}/playback`)
        .set('Cookie', learner.cookie)
        .expect(403);
      expect(playback.body.error).toMatchObject({
        name: 'LESSON_LOCKED',
        info: { cause: 'PREVIOUS_LESSON_INCOMPLETE', blockingLessonId: c.welcome },
      });
      await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 5 })
        .expect(403);
      await http()
        .post(`/courses/${c.courseId}/lessons/${c.v1}/complete`)
        .set('Cookie', learner.cookie)
        .expect(403);
    });

    it('records a manual completion once, idempotently (#90, #93)', async () => {
      const first = await http()
        .post(`/courses/${c.courseId}/lessons/${c.welcome}/complete`)
        .set('Cookie', learner.cookie)
        .expect(200);
      expect(first.body.data.source).toBe('MANUAL');
      const again = await http()
        .post(`/courses/${c.courseId}/lessons/${c.welcome}/complete`)
        .set('Cookie', learner.cookie)
        .expect(200);
      expect(again.body.data.completedAt).toBe(first.body.data.completedAt);
      expect(
        await prisma.lessonProgress.count({
          where: { studentId: learner.id, lessonId: c.welcome },
        }),
      ).toBe(1);
    });

    it('tracks watch position with a skip-resistant maximum and auto-completes (#91, #92)', async () => {
      await http()
        .get(`/courses/${c.courseId}/lessons/${c.v1}/playback`)
        .set('Cookie', learner.cookie)
        .expect(200);

      // First report: a jump to 95 s is stored as the last position, not as watched.
      let res = await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 95 })
        .expect(200);
      expect(res.body.data).toMatchObject({
        lastPositionSeconds: 95,
        maxPositionSeconds: 10,
        durationSeconds: 100,
        completion: null,
      });

      // An immediate second report earns (almost) nothing.
      res = await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 95 })
        .expect(200);
      expect(res.body.data.maxPositionSeconds).toBeLessThan(15);
      expect(res.body.data.completion).toBeNull();

      // 30 s of real watching later: 10 + 30×2 + 10 = 80, still short of 90 %.
      await backdateWatch(learner.id, c.v1, 30);
      res = await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 95 })
        .expect(200);
      expect(res.body.data.maxPositionSeconds).toBeGreaterThanOrEqual(80);
      expect(res.body.data.maxPositionSeconds).toBeLessThan(90);
      expect(res.body.data.completion).toBeNull();

      // Another 15 s: the maximum reaches 95 → 95 % ≥ the 90 % threshold.
      await backdateWatch(learner.id, c.v1, 15);
      res = await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 95 })
        .expect(200);
      expect(res.body.data.maxPositionSeconds).toBe(95);
      expect(res.body.data.completion).toMatchObject({ source: 'AUTO' });

      // Rewinding keeps the maximum and the completion; resume returns the last position.
      await backdateWatch(learner.id, c.v1, 5);
      res = await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 12.7 })
        .expect(200);
      expect(res.body.data).toMatchObject({ lastPositionSeconds: 12, maxPositionSeconds: 95 });
      const resume = await http()
        .get(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .expect(200);
      expect(resume.body.data).toMatchObject({
        lastPositionSeconds: 12,
        completion: { source: 'AUTO' },
      });
      const { lessons } = await outline(c.courseId, learner.cookie);
      expect(lessons.get(c.v1)).toMatchObject({ state: 'COMPLETED', resumePositionSeconds: 12 });
    });

    it('validates watch reports', async () => {
      await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: -1 })
        .expect(400);
      await http()
        .put(`/courses/${c.courseId}/lessons/${c.v1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: '10' })
        .expect(400);
      const text = await http()
        .put(`/courses/${c.courseId}/lessons/${c.t1}/watch`)
        .set('Cookie', learner.cookie)
        .send({ positionSeconds: 10 })
        .expect(409);
      expect(text.body.error).toMatchObject({
        name: 'PROGRESS_REFUSED',
        info: { reason: 'NOT_A_VIDEO' },
      });
    });

    it('completes quiz lessons only by passing them, and gates on the checkpoint (#77, #93)', async () => {
      await http()
        .post(`/courses/${c.courseId}/lessons/${c.t1}/complete`)
        .set('Cookie', learner.cookie)
        .expect(200);
      const manualQuiz = await http()
        .post(`/courses/${c.courseId}/lessons/${c.quiz}/complete`)
        .set('Cookie', learner.cookie)
        .expect(409);
      expect(manualQuiz.body.error.info).toMatchObject({ reason: 'QUIZ_LESSON' });

      let view = await outline(c.courseId, learner.cookie);
      expect(view.lessons.get(c.quiz)!.state).toBe('AVAILABLE');
      expect(view.lessons.get(c.v2)!.lock).toMatchObject({
        cause: 'CHECKPOINT_NOT_PASSED',
        blockingLessonId: c.quiz,
        message: expect.stringContaining('Forces checkpoint'),
      });
      expect(view.data.currentLessonId).toBe(c.quiz);

      const locked = await http()
        .get(`/courses/${c.courseId}/lessons/${c.v2}/playback`)
        .set('Cookie', learner.cookie)
        .expect(403);
      expect(locked.body.error).toMatchObject({
        name: 'LESSON_LOCKED',
        info: { cause: 'CHECKPOINT_NOT_PASSED', blockingLessonId: c.quiz },
      });

      // A failed attempt changes nothing; a passed one unlocks and records a QUIZ completion.
      await passQuiz(learner.id, c.quiz, false, 1);
      view = await outline(c.courseId, learner.cookie);
      expect(view.lessons.get(c.v2)!.state).toBe('LOCKED');

      await passQuiz(learner.id, c.quiz, true, 2);
      view = await outline(c.courseId, learner.cookie);
      expect(view.lessons.get(c.quiz)).toMatchObject({
        state: 'COMPLETED',
        completion: { source: 'QUIZ' },
      });
      expect(view.lessons.get(c.v2)!.state).toBe('AVAILABLE');
      expect(view.data).toMatchObject({
        currentLessonId: c.v2,
        completedLessons: 4,
        completionPercent: 80,
      });
      const row = await prisma.lessonProgress.findUniqueOrThrow({
        where: { studentId_lessonId: { studentId: learner.id, lessonId: c.quiz } },
      });
      expect(row.completionSource).toBe('QUIZ');

      await http()
        .get(`/courses/${c.courseId}/lessons/${c.v2}/playback`)
        .set('Cookie', learner.cookie)
        .expect(200);

      // The dashboard shows the same percentage (#94).
      const dashboard = await http().get('/me/enrollments').set('Cookie', learner.cookie);
      const entry = dashboard.body.data.find(
        (e: { course: { id: string } }) => e.course.id === c.courseId,
      );
      expect(entry.completionPercent).toBe(80);
    });

    it('never locks staff', async () => {
      const { data, lessons } = await outline(c.courseId, teacher);
      expect(data.viewer).toBe('STAFF');
      expect([...lessons.values()].every((l) => l.state === 'AVAILABLE')).toBe(true);
      const fresh = await student(c.courseId);
      const locked = await outline(c.courseId, fresh.cookie);
      expect(locked.lessons.get(c.v2)!.state).toBe('LOCKED');
      await http()
        .get(`/courses/${c.courseId}/lessons/${c.v2}/playback`)
        .set('Cookie', teacher)
        .expect(200);
      await http()
        .get(`/courses/${c.courseId}/lessons/${c.v2}/playback`)
        .set('Cookie', admin)
        .expect(200);
    });

    it('requires an enrollment for the outline and progress', async () => {
      const outsider = await student();
      const res = await http()
        .get(`/learn/courses/${c.courseId}`)
        .set('Cookie', outsider.cookie)
        .expect(403);
      expect(res.body.error.name).toBe('ENROLLMENT_REQUIRED');
      await http()
        .put(`/courses/${c.courseId}/lessons/${c.welcome}/watch`)
        .set('Cookie', outsider.cookie)
        .send({ positionSeconds: 5 })
        .expect(403);
      await http()
        .post(`/courses/${c.courseId}/lessons/${c.welcome}/complete`)
        .set('Cookie', outsider.cookie)
        .expect(403);
      await http().get(`/learn/courses/${c.courseId}`).expect(401);
      await http().put(`/courses/${c.courseId}/lessons/${c.v1}/watch`).send({}).expect(401);
      await http()
        .get(`/learn/courses/00000000-0000-4000-8000-000000000000`)
        .set('Cookie', learner.cookie)
        .expect(404);
    });

    it('shows the teacher progress and quiz results for their own course only (#95)', async () => {
      const report = await http()
        .get(`/teacher/courses/${c.courseId}/progress`)
        .set('Cookie', teacher)
        .expect(200);
      expect(report.body.data.totalLessons).toBe(5);
      const mine = report.body.data.students.items.find(
        (s: { student: { id: string } }) => s.student.id === learner.id,
      );
      expect(mine).toMatchObject({
        completedLessons: 4,
        completionPercent: 80,
        quizzes: [{ lessonId: c.quiz, attempts: 2, bestScorePct: 80, passed: true }],
      });
      expect(report.body.data.lessons.find((l: { id: string }) => l.id === c.quiz)).toMatchObject({
        isCheckpoint: true,
        completedCount: 1,
      });

      const detail = await http()
        .get(`/teacher/courses/${c.courseId}/progress/students/${learner.id}`)
        .set('Cookie', teacher)
        .expect(200);
      const lessons = detail.body.data.lessons as Array<{
        id: string;
        completion: { source: string } | null;
        watch: { maxPositionSeconds: number } | null;
        quizAttempts: unknown[];
      }>;
      expect(lessons.find((l) => l.id === c.v1)).toMatchObject({
        completion: { source: 'AUTO' },
        watch: { maxPositionSeconds: 95 },
      });
      expect(lessons.find((l) => l.id === c.quiz)!.quizAttempts).toHaveLength(2);

      await http()
        .get(`/teacher/courses/${c.courseId}/progress`)
        .set('Cookie', otherTeacher)
        .expect(404);
      await http()
        .get(`/teacher/courses/${c.courseId}/progress/students/${learner.id}`)
        .set('Cookie', otherTeacher)
        .expect(404);
      const outsider = await student();
      await http()
        .get(`/teacher/courses/${c.courseId}/progress/students/${outsider.id}`)
        .set('Cookie', teacher)
        .expect(404);
      await http()
        .get(`/teacher/courses/${c.courseId}/progress`)
        .set('Cookie', learner.cookie)
        .expect(403);
      await http().get(`/teacher/courses/${c.courseId}/progress`).expect(401);
    });
  });

  describe('a FREE course', () => {
    it('opens every lesson except those behind an unpassed checkpoint (#77)', async () => {
      const c = await buildCourse('FREE', 'Free physics');
      const learner = await student(c.courseId);
      let view = await outline(c.courseId, learner.cookie);
      expect(view.lessons.get(c.v1)!.state).toBe('AVAILABLE');
      expect(view.lessons.get(c.t1)!.state).toBe('AVAILABLE');
      expect(view.lessons.get(c.quiz)!.state).toBe('AVAILABLE');
      expect(view.lessons.get(c.v2)!.lock).toMatchObject({ cause: 'CHECKPOINT_NOT_PASSED' });

      // Out of order is fine in a FREE course.
      await http()
        .post(`/courses/${c.courseId}/lessons/${c.t1}/complete`)
        .set('Cookie', learner.cookie)
        .expect(200);
      await http()
        .post(`/courses/${c.courseId}/lessons/${c.v2}/complete`)
        .set('Cookie', learner.cookie)
        .expect(403);

      await passQuiz(learner.id, c.quiz);
      view = await outline(c.courseId, learner.cookie);
      expect(view.lessons.get(c.v2)!.state).toBe('AVAILABLE');
      expect(view.data.completedLessons).toBe(2);
    });
  });
});
