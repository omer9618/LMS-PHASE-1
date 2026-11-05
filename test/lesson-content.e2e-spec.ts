import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PDF = Buffer.from('%PDF-1.7\nworksheet\n%%EOF\n', 'latin1');
const PASSWORD = 'student passphrase for the player';

describe('Lesson content for the course player (#53)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let admin: string;
  let prisma: PrismaService;
  let ids: Classification;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    admin = await loginAs(app, SEEDED.admin);
    prisma = app.get(PrismaService);
    ids = await classification(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function student(enrolledIn?: string): Promise<string> {
    const email = uniqueEmail('player');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD),
        isEmailVerified: true,
        roles: { create: { role: 'STUDENT' } },
      },
    });
    if (enrolledIn) {
      await prisma.enrollment.create({
        data: { studentId: user.id, courseId: enrolledIn, source: 'ADMIN_GRANT' },
      });
    }
    return loginAs(app, { email, password: PASSWORD });
  }

  it('returns text and the file list to enrolled students and staff, and refuses others', async () => {
    const course = await createCourse(app, teacher, ids, 'Player course');
    const outline = await http()
      .post(`/teacher/courses/${course.id}/sections`)
      .set('Cookie', teacher)
      .send({ title: 'Reading' })
      .expect(201);
    const sectionId = outline.body.data.sections.at(-1).id;
    const withText = await http()
      .post(`/teacher/courses/${course.id}/sections/${sectionId}/lessons`)
      .set('Cookie', teacher)
      .send({ title: 'Notes', type: 'TEXT', bodyText: 'Newton: $F = ma$' })
      .expect(201);
    const lessonId = withText.body.data.sections.at(-1).lessons.at(-1).id;
    await http()
      .post(`/teacher/courses/${course.id}/lessons/${lessonId}/resources`)
      .set('Cookie', teacher)
      .attach('file', PDF, { filename: 'worksheet.pdf', contentType: 'application/pdf' })
      .expect(201);

    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', teacher).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send({ isFree: true })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);

    const path = `/courses/${course.id}/lessons/${lessonId}/content`;
    const enrolled = await student(course.id);
    const res = await http().get(path).set('Cookie', enrolled).expect(200);
    expect(res.body.data).toMatchObject({
      id: lessonId,
      title: 'Notes',
      type: 'TEXT',
      bodyText: 'Newton: $F = ma$',
      resources: [{ fileName: 'worksheet.pdf', fileSizeBytes: PDF.length }],
    });
    expect(JSON.stringify(res.body)).not.toContain('resources/');

    await http().get(path).set('Cookie', teacher).expect(200);
    const outsider = await student();
    await http().get(path).set('Cookie', outsider).expect(403);
    await http().get(path).expect(401);
  });
});
