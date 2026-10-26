import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { mailbox, uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

interface OutlineBody {
  sections: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }>;
}

describe('Course authoring and lifecycle (#25–#28, #31–#34)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let otherTeacher: string;
  let admin: string;
  let ids: Classification;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    otherTeacher = await loginAs(app, SEEDED.teacherB);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function publish(courseId: string) {
    await http().post(`/teacher/courses/${courseId}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${courseId}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${courseId}/approve`).set('Cookie', admin).expect(200);
  }

  describe('details and modes (#26, #33)', () => {
    it('creates with progression mode and audience, and edits details while drafting', async () => {
      const res = await http()
        .post('/teacher/courses')
        .set('Cookie', teacher)
        .send({
          boardId: ids.boardId,
          levelId: ids.levelId,
          subjectId: ids.subjectId,
          title: 'Mechanics',
          progressionMode: 'SEQUENTIAL',
          audienceType: 'TEACHER_PD',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        progressionMode: 'SEQUENTIAL',
        audienceType: 'TEACHER_PD',
      });

      const edited = await http()
        .patch(`/teacher/courses/${res.body.data.id}`)
        .set('Cookie', teacher)
        .send({ title: 'Mechanics I', description: 'Forces and motion', progressionMode: 'FREE' })
        .expect(200);
      expect(edited.body.data).toMatchObject({
        title: 'Mechanics I',
        description: 'Forces and motion',
        progressionMode: 'FREE',
      });
    });

    it('requires board, level and subject together when reclassifying', async () => {
      const course = await createCourse(app, teacher, ids, 'Reclassify', { withDemo: false });
      await http()
        .patch(`/teacher/courses/${course.id}`)
        .set('Cookie', teacher)
        .send({ boardId: ids.boardId })
        .expect(400);
    });

    it('locks details of a published course for the teacher, but an admin can still correct them', async () => {
      const course = await createCourse(app, teacher, ids, 'Locked details');
      await publish(course.id);

      const locked = await http()
        .patch(`/teacher/courses/${course.id}`)
        .set('Cookie', teacher)
        .send({ title: 'Sneaky rename' })
        .expect(409);
      expect(locked.body.error).toMatchObject({ name: 'COURSE_LOCKED' });
      expect(locked.body.error.message).toMatch(/Ask an admin/);

      const fixed = await http()
        .patch(`/admin/courses/${course.id}`)
        .set('Cookie', admin)
        .send({ title: 'Corrected title' })
        .expect(200);
      expect(fixed.body.data.title).toBe('Corrected title');
    });
  });

  describe('submission requires a demo (#34)', () => {
    it('refuses to submit without a free-preview video lesson', async () => {
      const course = await createCourse(app, teacher, ids, 'No demo', { withDemo: false });
      const res = await http()
        .post(`/teacher/courses/${course.id}/submit`)
        .set('Cookie', teacher)
        .expect(422);
      expect(res.body.error).toMatchObject({
        name: 'COURSE_INCOMPLETE',
        info: { missing: ['freePreviewVideoLesson'] },
      });
    });
  });

  describe('approval outcomes, unpublish, archive (#28, #26)', () => {
    it('emails the teacher on approval and on unpublish (with reason); unpublish returns to DRAFT', async () => {
      const course = await createCourse(app, teacher, ids, 'Unpublish me');
      await publish(course.id);
      expect(mailbox(app).lastTo(SEEDED.teacherA.email, 'COURSE_APPROVED')?.subject).toContain(
        'Unpublish me',
      );

      const res = await http()
        .post(`/admin/courses/${course.id}/unpublish`)
        .set('Cookie', admin)
        .send({ reason: 'Video 3 has no audio' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'DRAFT', publishedAt: null });
      const email = mailbox(app).lastTo(SEEDED.teacherA.email, 'COURSE_UNPUBLISHED');
      expect(email?.text).toContain('Video 3 has no audio');

      // Back in draft, the teacher can fix it and resubmit.
      await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    });

    it('emails the rejection reason to the teacher', async () => {
      const course = await createCourse(app, teacher, ids, 'Reject me');
      await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
      await http()
        .post(`/admin/courses/${course.id}/reject`)
        .set('Cookie', admin)
        .send({ reason: 'Wrong syllabus codes' })
        .expect(200);
      expect(mailbox(app).lastTo(SEEDED.teacherA.email, 'COURSE_REJECTED')?.text).toContain(
        'Wrong syllabus codes',
      );
    });

    it('archives a published course: closed to enrollment, cannot be reopened', async () => {
      const course = await createCourse(app, teacher, ids, 'Archive me');
      await publish(course.id);
      const res = await http()
        .post(`/teacher/courses/${course.id}/archive`)
        .set('Cookie', teacher)
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'ARCHIVED',
        isEnrollmentOpen: false,
        archivedAt: expect.any(String),
      });
      await http()
        .put(`/teacher/courses/${course.id}/enrollment`)
        .set('Cookie', teacher)
        .send({ open: true })
        .expect(409);
      await http().post(`/teacher/courses/${course.id}/archive`).set('Cookie', teacher).expect(409);
    });
  });

  describe('enrollment toggle (#32) and pricing after publication (#31)', () => {
    it('toggles enrollment independently of publication status', async () => {
      const course = await createCourse(app, teacher, ids, 'Toggle me', { withDemo: false });
      const closed = await http()
        .put(`/teacher/courses/${course.id}/enrollment`)
        .set('Cookie', teacher)
        .send({ open: false })
        .expect(200);
      expect(closed.body.data).toMatchObject({ status: 'DRAFT', isEnrollmentOpen: false });
      await http()
        .put(`/admin/courses/${course.id}/enrollment`)
        .set('Cookie', admin)
        .send({ open: true })
        .expect(200);
    });

    it('lets an admin change the price of a published course, auditing from and to', async () => {
      const course = await createCourse(app, teacher, ids, 'Reprice me');
      await publish(course.id);
      const res = await http()
        .put(`/admin/courses/${course.id}/pricing`)
        .set('Cookie', admin)
        .send({ isFree: false, priceMinor: '250000', currency: 'PKR', commissionRateBps: 2500 })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'PUBLISHED',
        priceMinor: '250000',
        isFree: false,
      });

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: course.id, action: 'COURSE_PRICED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.details).toMatchObject({
        status: 'PUBLISHED',
        from: { isFree: true, priceMinor: null },
        to: { isFree: false, priceMinor: '250000', commissionRateBps: 2500 },
      });
    });
  });

  describe('hard delete (#26)', () => {
    it('deletes a course nobody has enrolled in, with its outline', async () => {
      const course = await createCourse(app, teacher, ids, 'Delete me');
      await http().delete(`/teacher/courses/${course.id}`).set('Cookie', teacher).expect(200);
      await http().get(`/teacher/courses/${course.id}`).set('Cookie', teacher).expect(404);
      expect(await prisma.section.count({ where: { courseId: course.id } })).toBe(0);
    });

    it('refuses once a student has enrolled', async () => {
      const course = await createCourse(app, teacher, ids, 'Keep me');
      const student = await prisma.user.create({
        data: {
          email: uniqueEmail('enrolled'),
          passwordHash: '!',
          roles: { create: { role: 'STUDENT' } },
        },
      });
      await prisma.enrollment.create({
        data: { studentId: student.id, courseId: course.id, source: 'ADMIN_GRANT' },
      });
      const res = await http()
        .delete(`/teacher/courses/${course.id}`)
        .set('Cookie', teacher)
        .expect(409);
      expect(res.body.error.info).toEqual({ enrollments: 1, orderItems: 0 });
    });
  });

  describe('outline: sections and lessons (#27)', () => {
    let courseId: string;
    const outlineOf = async (): Promise<OutlineBody> =>
      (await http().get(`/teacher/courses/${courseId}/outline`).set('Cookie', teacher).expect(200))
        .body.data;

    beforeAll(async () => {
      courseId = (await createCourse(app, teacher, ids, 'Outline course', { withDemo: false })).id;
    });

    it('builds, reorders and moves sections and lessons', async () => {
      const add = (title: string) =>
        http().post(`/teacher/courses/${courseId}/sections`).set('Cookie', teacher).send({ title });
      await add('Kinematics').expect(201);
      await add('Dynamics').expect(201);
      let outline = await outlineOf();
      const [kin, dyn] = outline.sections;

      for (const title of ['Speed', 'Velocity', 'Acceleration']) {
        await http()
          .post(`/teacher/courses/${courseId}/sections/${kin.id}/lessons`)
          .set('Cookie', teacher)
          .send({ title, type: 'TEXT', bodyText: `${title} notes` })
          .expect(201);
      }
      outline = await outlineOf();
      const [speed, velocity, acceleration] = outline.sections[0].lessons;

      // Reorder sections and lessons.
      await http()
        .put(`/teacher/courses/${courseId}/sections/order`)
        .set('Cookie', teacher)
        .send({ sectionIds: [dyn.id, kin.id] })
        .expect(200);
      const reordered = await http()
        .put(`/teacher/courses/${courseId}/sections/${kin.id}/lessons/order`)
        .set('Cookie', teacher)
        .send({ lessonIds: [acceleration.id, speed.id, velocity.id] })
        .expect(200);
      expect(reordered.body.data.sections.map((s: { title: string }) => s.title)).toEqual([
        'Dynamics',
        'Kinematics',
      ]);
      expect(
        reordered.body.data.sections[1].lessons.map((l: { title: string }) => l.title),
      ).toEqual(['Acceleration', 'Speed', 'Velocity']);

      // Move a lesson between sections.
      const moved = await http()
        .post(`/teacher/courses/${courseId}/lessons/${velocity.id}/move`)
        .set('Cookie', teacher)
        .send({ sectionId: dyn.id, position: 0 })
        .expect(200);
      const titles = (i: number) =>
        moved.body.data.sections[i].lessons.map((l: { title: string }) => l.title);
      expect(titles(0)).toEqual(['Velocity']);
      expect(titles(1)).toEqual(['Acceleration', 'Speed']);
    });

    it('validates lessons and refuses incomplete reorders', async () => {
      const outline = await outlineOf();
      const section = outline.sections[0];
      await http()
        .post(`/teacher/courses/${courseId}/sections/${section.id}/lessons`)
        .set('Cookie', teacher)
        .send({ title: 'Empty text', type: 'TEXT' })
        .expect(400);
      await http()
        .put(`/teacher/courses/${courseId}/sections/order`)
        .set('Cookie', teacher)
        .send({ sectionIds: [section.id] })
        .expect(400);
    });

    it('protects student work and non-empty sections from deletion', async () => {
      const outline = await outlineOf();
      const section = outline.sections[1];
      await http()
        .delete(`/teacher/courses/${courseId}/sections/${section.id}`)
        .set('Cookie', teacher)
        .expect(409);

      const lesson = section.lessons[0];
      const student = await prisma.user.create({
        data: {
          email: uniqueEmail('progress'),
          passwordHash: '!',
          roles: { create: { role: 'STUDENT' } },
        },
      });
      await prisma.lessonProgress.create({
        data: { studentId: student.id, lessonId: lesson.id, completionSource: 'MANUAL' },
      });
      await http()
        .delete(`/teacher/courses/${courseId}/lessons/${lesson.id}`)
        .set('Cookie', teacher)
        .expect(409);

      // A lesson without student work can go, and positions stay dense.
      const other = section.lessons[1];
      const after = await http()
        .delete(`/teacher/courses/${courseId}/lessons/${other.id}`)
        .set('Cookie', teacher)
        .expect(200);
      expect(after.body.data.sections[1].lessons.map((l: { id: string }) => l.id)).toEqual([
        lesson.id,
      ]);
    });

    it('another teacher cannot see or change the outline (#117)', async () => {
      const outline = await outlineOf();
      await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', otherTeacher)
        .expect(404);
      await http()
        .post(`/teacher/courses/${courseId}/sections`)
        .set('Cookie', otherTeacher)
        .send({ title: 'Intrusion' })
        .expect(404);
      await http()
        .patch(`/teacher/courses/${courseId}/lessons/${outline.sections[0].lessons[0].id}`)
        .set('Cookie', otherTeacher)
        .send({ title: 'Hijacked' })
        .expect(404);
    });

    it('locks content while the course is in review', async () => {
      const course = await createCourse(app, teacher, ids, 'In review');
      await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
      await http()
        .post(`/teacher/courses/${course.id}/sections`)
        .set('Cookie', teacher)
        .send({ title: 'Late addition' })
        .expect(409);
      // Admins can review the outline.
      await http().get(`/admin/courses/${course.id}/outline`).set('Cookie', admin).expect(200);
    });
  });
});
