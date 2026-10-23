import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { createTestApp } from './utils/test-app';

describe('Courses: create, submit, price, approve, reject (#24, #25, #28, #29)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let admin: string;
  let ids: Classification & { otherBoardLevelId: string };

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('creates a DRAFT course with board, level, subject and syllabus area', async () => {
    const course = await createCourse(app, teacher, ids, 'Algebra basics');
    expect(course).toMatchObject({
      status: 'DRAFT',
      syllabusArea: 'Algebra',
      boardId: ids.boardId,
      levelId: ids.levelId,
      subjectId: ids.subjectId,
      priceMinor: null,
    });
  });

  it('rejects a level from another board with a clean 400', async () => {
    const res = await http()
      .post('/teacher/courses')
      .set('Cookie', teacher)
      .send({
        boardId: ids.boardId,
        subjectId: ids.subjectId,
        levelId: ids.otherBoardLevelId,
        title: 'Mismatch',
      })
      .expect(400);
    expect(res.body.error).toEqual({
      name: 'INVALID_REFERENCE',
      message: 'The selected level does not belong to the selected board',
      info: { field: 'levelId' },
    });
  });

  it('admins cannot create courses (TEACHER role required)', async () => {
    await http()
      .post('/teacher/courses')
      .set('Cookie', admin)
      .send({ boardId: ids.boardId, levelId: ids.levelId, subjectId: ids.subjectId, title: 'x' })
      .expect(403);
  });

  it('full flow: submit -> approve blocked by publish guard -> price -> approve', async () => {
    const course = await createCourse(app, teacher, ids, 'Paid course');

    // Pricing is not allowed before submission.
    const early = await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: false, priceMinor: '150000', currency: 'PKR', commissionRateBps: 2000 })
      .expect(409);
    expect(early.body.error.name).toBe('COURSE_NOT_PRICEABLE');

    const submitted = await http()
      .post(`/teacher/courses/${course.id}/submit`)
      .set('Cookie', teacher)
      .send({ teacherProposedBps: 1500 })
      .expect(200);
    expect(submitted.body.data).toMatchObject({
      status: 'PENDING_APPROVAL',
      teacherProposedBps: 1500,
    });

    // Submitting twice is an invalid transition.
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(409);

    // The review queue shows it.
    const queue = await http().get('/admin/courses?limit=100').set('Cookie', admin).expect(200);
    expect(queue.body.data.map((c: { id: string }) => c.id)).toContain(course.id);

    // Publish guard: no price yet.
    const blocked = await http()
      .post(`/admin/courses/${course.id}/approve`)
      .set('Cookie', admin)
      .expect(422);
    expect(blocked.body.error).toMatchObject({
      name: 'PUBLISH_GUARD_FAILED',
      info: { missing: ['priceMinor', 'commissionRateBps'] },
    });

    const priced = await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: false, priceMinor: '150000', currency: 'PKR', commissionRateBps: 2000 })
      .expect(200);
    expect(priced.body.data).toMatchObject({
      priceMinor: '150000', // bigint over JSON as a string of minor units
      currency: 'PKR',
      commissionRateBps: 2000,
      pricedById: expect.any(String),
      pricedAt: expect.any(String),
    });

    const approved = await http()
      .post(`/admin/courses/${course.id}/approve`)
      .set('Cookie', admin)
      .expect(200);
    expect(approved.body.data).toMatchObject({
      status: 'PUBLISHED',
      publishedAt: expect.any(String),
    });

    // Approving again is an invalid transition.
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(409);
  });

  it('a free course can be approved without price or commission', async () => {
    const course = await createCourse(app, teacher, ids, 'Free course');
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    const res = await http()
      .post(`/admin/courses/${course.id}/approve`)
      .set('Cookie', admin)
      .expect(200);
    expect(res.body.data).toMatchObject({ status: 'PUBLISHED', isFree: true, priceMinor: null });
  });

  it('rejects with a required reason, stored in audit_log', async () => {
    const course = await createCourse(app, teacher, ids, 'To be rejected');
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);

    await http()
      .post(`/admin/courses/${course.id}/reject`)
      .set('Cookie', admin)
      .send({ reason: '   ' })
      .expect(400);

    const res = await http()
      .post(`/admin/courses/${course.id}/reject`)
      .set('Cookie', admin)
      .send({ reason: 'Syllabus area does not match the subject' })
      .expect(200);
    expect(res.body.data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Syllabus area does not match the subject',
    });

    // The teacher reads the reason on their course, in detail and in their list.
    const mine = await http()
      .get(`/teacher/courses/${course.id}`)
      .set('Cookie', teacher)
      .expect(200);
    expect(mine.body.data.rejectionReason).toBe('Syllabus area does not match the subject');
    const list = await http()
      .get('/teacher/courses?status=REJECTED&limit=100')
      .set('Cookie', teacher)
      .expect(200);
    expect(list.body.data.find((c: { id: string }) => c.id === course.id)?.rejectionReason).toBe(
      'Syllabus area does not match the subject',
    );

    // Rejection is final: the teacher cannot resubmit.
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(409);

    const entry = await app.get(PrismaService).auditLog.findFirst({
      where: { entityType: 'course', entityId: course.id, action: 'COURSE_REJECTED' },
    });
    expect(entry?.details).toEqual({
      from: 'PENDING_APPROVAL',
      to: 'REJECTED',
      reason: 'Syllabus area does not match the subject',
    });
  });

  it('rejects money sent as a JSON number', async () => {
    const course = await createCourse(app, teacher, ids, 'Number money');
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    const res = await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: false, priceMinor: 1500.5, currency: 'PKR', commissionRateBps: 2000 })
      .expect(400);
    expect(res.body.error.name).toBe('VALIDATION_FAILED');
  });
});
