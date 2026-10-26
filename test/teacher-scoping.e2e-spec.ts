import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { loginAs, SEEDED } from './utils/auth';
import { classification, createCourse } from './utils/courses';
import { createTestApp } from './utils/test-app';

/**
 * #117 (early slice): cross-teacher access fails server-side.
 * The full access-control suite is still to come in M3.
 */
describe('Teacher scoping: teacher A cannot read or modify teacher B’s course', () => {
  let app: NestExpressApplication;
  let cookieA: string;
  let cookieB: string;
  let courseOfB: { id: string };

  beforeAll(async () => {
    app = await createTestApp();
    cookieA = await loginAs(app, SEEDED.teacherA);
    cookieB = await loginAs(app, SEEDED.teacherB);
    courseOfB = await createCourse(
      app,
      cookieB,
      await classification(app),
      `B's course ${Date.now()}`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('teacher B can read their own course (control)', async () => {
    await request(app.getHttpServer())
      .get(`/teacher/courses/${courseOfB.id}`)
      .set('Cookie', cookieB)
      .expect(200);
  });

  it('teacher A gets 404 reading it: existence is not revealed', async () => {
    const res = await request(app.getHttpServer())
      .get(`/teacher/courses/${courseOfB.id}`)
      .set('Cookie', cookieA)
      .expect(404);
    expect(res.body.error.name).toBe('NOT_FOUND');
  });

  it('teacher A cannot see it in their list, which holds only A’s own courses', async () => {
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookieA)
      .expect(200);
    const res = await request(app.getHttpServer())
      .get('/teacher/courses?limit=100')
      .set('Cookie', cookieA)
      .expect(200);
    const courses = res.body.data as Array<{ id: string; teacherId: string }>;
    expect(courses.map((c) => c.id)).not.toContain(courseOfB.id);
    expect(courses.every((c) => c.teacherId === me.body.data.id)).toBe(true);
  });

  it('teacher A cannot modify it (submit), and the course is unchanged', async () => {
    await request(app.getHttpServer())
      .post(`/teacher/courses/${courseOfB.id}/submit`)
      .set('Cookie', cookieA)
      .send({})
      .expect(404);

    const res = await request(app.getHttpServer())
      .get(`/teacher/courses/${courseOfB.id}`)
      .set('Cookie', cookieB)
      .expect(200);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('teacher A cannot reach the admin endpoints for it', async () => {
    await request(app.getHttpServer())
      .get(`/admin/courses/${courseOfB.id}`)
      .set('Cookie', cookieA)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/admin/courses/${courseOfB.id}/approve`)
      .set('Cookie', cookieA)
      .expect(403);
  });

  it('a course cannot be created for another teacher by passing teacherId', async () => {
    const { boardId, levelId, subjectId } = await classification(app);
    const res = await request(app.getHttpServer())
      .post('/teacher/courses')
      .set('Cookie', cookieA)
      .send({ boardId, levelId, subjectId, title: 'Spoof', teacherId: 'someone-else' })
      .expect(400);
    expect(res.body.error.name).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body.error.info.issues)).toContain('teacherId');
  });
});
