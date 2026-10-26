import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { FakeVideoProvider } from '../src/modules/content/adapters/fake-video.provider';
import { VideoProviderRegistry } from '../src/modules/content/services/video-provider.registry';
import { hashPassword } from '../src/modules/auth/services/passwords';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PDF = Buffer.from('%PDF-1.7\nworksheet\n%%EOF\n', 'latin1');
const STUDENT_PASSWORD = 'student passphrase for content';

describe('Lesson content: videos, playback, resources (#35–#39)', () => {
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

  const fake = () => app.get(VideoProviderRegistry).forUploads() as FakeVideoProvider;

  function sendWebhook(videoId: string, status: string, signature?: string) {
    const body = JSON.stringify({ videoId, status });
    return http()
      .post('/webhooks/video/self-hosted')
      .set('Content-Type', 'application/json')
      .set('x-fake-video-signature', signature ?? fake().sign(Buffer.from(body)))
      .send(body);
  }

  async function videoLesson(courseId: string, isFreePreview: boolean) {
    const outline = await http()
      .post(`/teacher/courses/${courseId}/sections`)
      .set('Cookie', teacher)
      .send({ title: 'Videos' })
      .expect(201);
    const sectionId = outline.body.data.sections.at(-1).id;
    const res = await http()
      .post(`/teacher/courses/${courseId}/sections/${sectionId}/lessons`)
      .set('Cookie', teacher)
      .send({ title: 'Projectile motion', type: 'VIDEO', isFreePreview })
      .expect(201);
    return res.body.data.sections.at(-1).lessons.at(-1).id as string;
  }

  async function uploadReadyVideo(courseId: string, lessonId: string) {
    const ticket = await http()
      .post(`/teacher/courses/${courseId}/lessons/${lessonId}/video`)
      .set('Cookie', teacher)
      .send({})
      .expect(201);
    await sendWebhook(ticket.body.data.upload.headers.VideoId, 'READY').expect(204);
    return ticket.body.data;
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

  async function student(enrolledIn?: string) {
    const email = uniqueEmail('learner');
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
    return loginAs(app, { email, password: STUDENT_PASSWORD });
  }

  describe('video upload and processing (#35, #36)', () => {
    it('issues direct-upload credentials, attaches the video, and processes the signed webhook', async () => {
      const course = await createCourse(app, teacher, ids, 'Video course', { withDemo: false });
      const lessonId = await videoLesson(course.id, false);

      const ticket = await http()
        .post(`/teacher/courses/${course.id}/lessons/${lessonId}/video`)
        .set('Cookie', teacher)
        .send({ title: 'Lecture 1' })
        .expect(201);
      expect(ticket.body.data).toMatchObject({
        videoAssetId: expect.any(String),
        upload: { protocol: 'tus', metadata: { title: 'Lecture 1' } },
      });
      const videoId = ticket.body.data.upload.headers.VideoId;

      let outline = await http()
        .get(`/teacher/courses/${course.id}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      expect(outline.body.data.sections[0].lessons[0].videoAsset).toMatchObject({
        status: 'PROCESSING',
        provider: 'SELF_HOSTED',
      });

      // Forged webhooks are refused and change nothing.
      await sendWebhook(videoId, 'READY', 'f'.repeat(64)).expect(401);
      await sendWebhook(videoId, 'READY').expect(204);

      outline = await http()
        .get(`/teacher/courses/${course.id}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      expect(outline.body.data.sections[0].lessons[0].videoAsset.status).toBe('READY');
    });

    it('refuses videos on non-video lessons and on other teachers’ lessons', async () => {
      const course = await createCourse(app, teacher, ids, 'Mixed', { withDemo: false });
      const outline = await http()
        .post(`/teacher/courses/${course.id}/sections`)
        .set('Cookie', teacher)
        .send({ title: 'S' })
        .expect(201);
      const sectionId = outline.body.data.sections[0].id;
      const text = await http()
        .post(`/teacher/courses/${course.id}/sections/${sectionId}/lessons`)
        .set('Cookie', teacher)
        .send({ title: 'Notes', type: 'TEXT', bodyText: 'x' })
        .expect(201);
      const textLessonId = text.body.data.sections[0].lessons[0].id;
      await http()
        .post(`/teacher/courses/${course.id}/lessons/${textLessonId}/video`)
        .set('Cookie', teacher)
        .send({})
        .expect(400);

      const videoId = await videoLesson(course.id, false);
      await http()
        .post(`/teacher/courses/${course.id}/lessons/${videoId}/video`)
        .set('Cookie', otherTeacher)
        .send({})
        .expect(404);
    });
  });

  describe('playback access (#37, #39, #34)', () => {
    let courseId: string;
    let previewLesson: string;
    let paidLesson: string;

    beforeAll(async () => {
      courseId = (await createCourse(app, teacher, ids, 'Gated course', { withDemo: false })).id;
      previewLesson = await videoLesson(courseId, true);
      paidLesson = await videoLesson(courseId, false);
      await uploadReadyVideo(courseId, previewLesson);
      await uploadReadyVideo(courseId, paidLesson);
    });

    const play = (lessonId: string, cookie?: string) => {
      const req = http().get(`/courses/${courseId}/lessons/${lessonId}/playback`);
      return cookie ? req.set('Cookie', cookie) : req;
    };

    it('only staff can play while the course is a draft; visitors see nothing', async () => {
      const res = await play(paidLesson, teacher).expect(200);
      expect(res.body.data).toMatchObject({
        embedUrl: expect.any(String),
        expiresAt: expect.any(String),
      });
      await play(paidLesson, admin).expect(200);
      await play(previewLesson).expect(404);
    });

    it('once published: free preview is public, the rest needs an enrollment', async () => {
      await publish(courseId);

      await play(previewLesson).expect(200);
      await play(paidLesson).expect(401);

      const outsider = await student();
      const denied = await play(paidLesson, outsider).expect(403);
      expect(denied.body.error.name).toBe('ENROLLMENT_REQUIRED');

      const enrolled = await student(courseId);
      await play(paidLesson, enrolled).expect(200);
    });

    it('an expired enrollment no longer grants access (#51)', async () => {
      const email = uniqueEmail('expired');
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(STUDENT_PASSWORD),
          roles: { create: { role: 'STUDENT' } },
        },
      });
      await prisma.enrollment.create({
        data: {
          studentId: user.id,
          courseId,
          source: 'ADMIN_GRANT',
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const cookie = await loginAs(app, { email, password: STUDENT_PASSWORD });
      await play(paidLesson, cookie).expect(403);
    });

    it('a video still processing cannot be played', async () => {
      const lessonId = await videoLesson(courseId, false);
      await http()
        .post(`/teacher/courses/${courseId}/lessons/${lessonId}/video`)
        .set('Cookie', teacher)
        .send({})
        .expect(201);
      const res = await play(lessonId, teacher).expect(409);
      expect(res.body.error.name).toBe('VIDEO_NOT_READY');
    });
  });

  describe('resources (#38, #39)', () => {
    let courseId: string;
    let lessonId: string;

    beforeAll(async () => {
      courseId = (await createCourse(app, teacher, ids, 'Resource course')).id;
      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      lessonId = outline.body.data.sections[0].lessons[0].id;
    });

    const upload = (cookie: string, file: Buffer, name: string) =>
      http()
        .post(`/teacher/courses/${courseId}/lessons/${lessonId}/resources`)
        .set('Cookie', cookie)
        .attach('file', file, name);

    it('uploads PDFs to storage, rejects other types, and never exposes the storage key', async () => {
      const res = await upload(teacher, PDF, 'Worksheet 1.pdf').expect(201);
      expect(res.body.data).toEqual([
        {
          id: expect.any(String),
          lessonId,
          fileName: 'Worksheet 1.pdf',
          fileSizeBytes: PDF.length,
          orderIndex: 0,
        },
      ]);
      await upload(teacher, Buffer.from('not a pdf'), 'fake.pdf').expect(400);
      await upload(otherTeacher, PDF, 'intrusion.pdf').expect(404);
    });

    it('serves downloads only to enrolled students and staff', async () => {
      await publish(courseId);
      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const resourceId = outline.body.data.sections[0].lessons[0].resources[0].id;
      const path = `/courses/${courseId}/lessons/${lessonId}/resources/${resourceId}/download`;

      // Even on a free-preview lesson, resources need an enrollment.
      // Sign in first: awaiting inside a supertest chain breaks its lazily started server.
      const outsider = await student();
      const enrolled = await student(courseId);
      await http().get(path).expect(401);
      await http().get(path).set('Cookie', outsider).expect(403);

      const res = await http().get(path).set('Cookie', enrolled).expect(200);
      const file = await http().get(new URL(res.body.data.url).pathname).expect(200);
      expect(file.body.toString('latin1')).toBe(PDF.toString('latin1'));
      expect(file.headers['content-disposition']).toContain('Worksheet 1.pdf');
    });

    it('deletes a resource and its file', async () => {
      const outline = await http()
        .get(`/teacher/courses/${courseId}/outline`)
        .set('Cookie', teacher)
        .expect(200);
      const resourceId = outline.body.data.sections[0].lessons[0].resources[0].id;
      const res = await http()
        .delete(`/teacher/courses/${courseId}/lessons/${lessonId}/resources/${resourceId}`)
        .set('Cookie', teacher)
        .expect(200);
      expect(res.body.data).toEqual([]);
    });
  });
});
