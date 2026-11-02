import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const PASSWORD = 'ProfileTeacher123!';

describe('Teacher profiles (#98, #99, #100)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let ids: Classification;
  const http = () => request(app.getHttpServer());

  /** A fresh teacher per test, so the seeded teachers' profiles stay untouched. */
  async function newTeacher(name = 'Profile Teacher'): Promise<{ id: string; cookie: string }> {
    const email = uniqueEmail('profile-teacher');
    const user = await prisma.user.create({
      data: {
        email,
        fullName: name,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        isEmailVerified: true,
        roles: { create: [{ role: 'TEACHER' }] },
      },
    });
    return { id: user.id, cookie: await loginAs(app, { email, password: PASSWORD }) };
  }

  async function publishedProfile(name?: string) {
    const teacher = await newTeacher(name);
    await http()
      .put('/teacher/profile')
      .set('Cookie', teacher.cookie)
      .send({ bio: 'I teach physics.' })
      .expect(200);
    await http().post('/teacher/profile/publish').set('Cookie', teacher.cookie).expect(200);
    return teacher;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('editor (#98)', () => {
    it('starts empty, is created on first save, and returns every field', async () => {
      const teacher = await newTeacher('Ayesha Khan');
      const empty = await http().get('/teacher/profile').set('Cookie', teacher.cookie).expect(200);
      expect(empty.body.data).toEqual({
        teacherId: teacher.id,
        fullName: 'Ayesha Khan',
        bio: null,
        qualifications: null,
        socialLinks: [],
        f2fLocations: [],
        photoUrl: null,
        isPublished: false,
        moderation: null,
      });
      expect(await prisma.teacherProfile.findUnique({ where: { userId: teacher.id } })).toBeNull();

      const saved = await http()
        .put('/teacher/profile')
        .set('Cookie', teacher.cookie)
        .send({
          bio: 'A-level physics, 10 years.',
          qualifications: 'MSc Physics',
          socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/@ayesha' }],
          f2fLocations: [{ city: 'Lahore', area: 'Gulberg', notes: 'Weekends' }],
        })
        .expect(200);
      expect(saved.body.data).toMatchObject({
        bio: 'A-level physics, 10 years.',
        qualifications: 'MSc Physics',
        socialLinks: [{ label: 'YouTube', url: 'https://youtube.com/@ayesha' }],
        f2fLocations: [{ city: 'Lahore', area: 'Gulberg', notes: 'Weekends' }],
        isPublished: false,
      });

      // A partial edit keeps the other fields; null clears.
      const edited = await http()
        .put('/teacher/profile')
        .set('Cookie', teacher.cookie)
        .send({ qualifications: null })
        .expect(200);
      expect(edited.body.data).toMatchObject({
        bio: 'A-level physics, 10 years.',
        qualifications: null,
      });
    });

    it('validates links, locations and unknown fields', async () => {
      const teacher = await newTeacher();
      const put = (body: object) =>
        http().put('/teacher/profile').set('Cookie', teacher.cookie).send(body);
      await put({ socialLinks: [{ label: 'x', url: 'javascript:alert(1)' }] }).expect(400);
      await put({ socialLinks: [{ label: 'x', url: 'ftp://example.com' }] }).expect(400);
      await put({ f2fLocations: [{ area: 'No city' }] }).expect(400);
      await put({ isPublished: true }).expect(400);
      await put({ photoUrl: 'https://evil.example.com/x.png' }).expect(400);
    });

    it('requires a bio to publish, and keeps a published profile complete', async () => {
      const teacher = await newTeacher();
      const refused = await http()
        .post('/teacher/profile/publish')
        .set('Cookie', teacher.cookie)
        .expect(422);
      expect(refused.body.error).toMatchObject({
        name: 'PROFILE_INCOMPLETE',
        info: { missing: ['bio'] },
      });

      await http()
        .put('/teacher/profile')
        .set('Cookie', teacher.cookie)
        .send({ bio: 'Chemistry.' })
        .expect(200);
      const published = await http()
        .post('/teacher/profile/publish')
        .set('Cookie', teacher.cookie)
        .expect(200);
      expect(published.body.data.isPublished).toBe(true);
      await http().post('/teacher/profile/publish').set('Cookie', teacher.cookie).expect(409);
      await http()
        .put('/teacher/profile')
        .set('Cookie', teacher.cookie)
        .send({ bio: '' })
        .expect(422);

      const unpublished = await http()
        .post('/teacher/profile/unpublish')
        .set('Cookie', teacher.cookie)
        .expect(200);
      expect(unpublished.body.data).toMatchObject({ isPublished: false, moderation: null });
      await http().post('/teacher/profile/unpublish').set('Cookie', teacher.cookie).expect(409);
    });

    it('uploads a photo to storage, serves it signed, replaces and removes it', async () => {
      const teacher = await newTeacher();
      const upload = (file: Buffer, name: string) =>
        http()
          .post('/teacher/profile/photo')
          .set('Cookie', teacher.cookie)
          .attach('photo', file, name);

      await upload(Buffer.from('%PDF-1.4 not an image'), 'cv.pdf').expect(400);
      await http().post('/teacher/profile/photo').set('Cookie', teacher.cookie).expect(400);

      const first = await upload(PNG, 'me.png').expect(200);
      const firstKey = (
        await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: teacher.id } })
      ).photoUrl!;
      expect(firstKey).toMatch(new RegExp(`^profile-photos/${teacher.id}/.+\\.png$`));
      expect(first.body.data.photoUrl).toEqual(expect.stringMatching(/^https?:\/\//));
      expect(first.body.data.photoUrl).not.toContain(firstKey);

      await upload(PNG, 'me2.png').expect(200);
      const secondKey = (
        await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: teacher.id } })
      ).photoUrl!;
      expect(secondKey).not.toBe(firstKey);

      const removed = await http()
        .delete('/teacher/profile/photo')
        .set('Cookie', teacher.cookie)
        .expect(200);
      expect(removed.body.data.photoUrl).toBeNull();
    });

    it('is for teachers only', async () => {
      await http().get('/teacher/profile').expect(401);
      const studentEmail = uniqueEmail('profile-student');
      await prisma.user.create({
        data: {
          email: studentEmail,
          passwordHash: await bcrypt.hash(PASSWORD, 4),
          roles: { create: [{ role: 'STUDENT' }] },
        },
      });
      const student = await loginAs(app, { email: studentEmail, password: PASSWORD });
      await http().get('/teacher/profile').set('Cookie', student).expect(403);
      await http().put('/teacher/profile').set('Cookie', student).send({ bio: 'x' }).expect(403);
    });
  });

  describe('public page (#99)', () => {
    it("shows a published profile with the teacher's public courses only", async () => {
      const teacher = await publishedProfile('Bilal Ahmed');
      await http()
        .put('/teacher/profile')
        .set('Cookie', teacher.cookie)
        .send({
          qualifications: 'PhD',
          socialLinks: [{ label: 'Site', url: 'https://bilal.example.com' }],
          f2fLocations: [{ city: 'Karachi' }],
        })
        .expect(200);
      await http()
        .post('/teacher/profile/photo')
        .set('Cookie', teacher.cookie)
        .attach('photo', PNG, 'me.png')
        .expect(200);

      const published = await createCourse(app, teacher.cookie, ids, 'Bilal published course');
      await http()
        .post(`/teacher/courses/${published.id}/submit`)
        .set('Cookie', teacher.cookie)
        .expect(200);
      await http()
        .put(`/admin/courses/${published.id}/pricing`)
        .set('Cookie', admin)
        .send({ isFree: true })
        .expect(200);
      await http().post(`/admin/courses/${published.id}/approve`).set('Cookie', admin).expect(200);
      await createCourse(app, teacher.cookie, ids, 'Bilal draft course');

      const res = await http().get(`/teachers/${teacher.id}`).expect(200);
      expect(res.body.data).toMatchObject({
        teacherId: teacher.id,
        fullName: 'Bilal Ahmed',
        bio: 'I teach physics.',
        qualifications: 'PhD',
        socialLinks: [{ label: 'Site', url: 'https://bilal.example.com' }],
        f2fLocations: [{ city: 'Karachi' }],
        photoUrl: expect.stringMatching(/^https?:\/\//),
        courses: { total: 1, items: [{ id: published.id, title: 'Bilal published course' }] },
      });
      expect(res.body.data).not.toHaveProperty('isPublished');
      expect(res.body.data).not.toHaveProperty('moderation');
      expect(res.body.data.courses.items[0]).not.toHaveProperty('commissionRateBps');

      // The catalogue course detail shows the published profile, with a signed photo URL.
      const detail = await http().get(`/catalogue/courses/${published.id}`).expect(200);
      expect(detail.body.data.teacher.profile).toEqual({
        bio: 'I teach physics.',
        qualifications: 'PhD',
        photoUrl: expect.stringMatching(/^https?:\/\//),
      });
      expect(detail.body.data.teacher.profile.photoUrl).not.toContain('profile-photos/');
    });

    it('is 404 for unpublished profiles, teachers without one, suspended teachers and non-teachers', async () => {
      const draft = await newTeacher();
      await http()
        .put('/teacher/profile')
        .set('Cookie', draft.cookie)
        .send({ bio: 'Not yet public' })
        .expect(200);
      await http().get(`/teachers/${draft.id}`).expect(404);

      const none = await newTeacher();
      await http().get(`/teachers/${none.id}`).expect(404);

      const suspended = await publishedProfile();
      await http().get(`/teachers/${suspended.id}`).expect(200);
      await http()
        .post(`/admin/users/${suspended.id}/suspend`)
        .set('Cookie', admin)
        .send({ reason: 'Testing public visibility' })
        .expect(200);
      await http().get(`/teachers/${suspended.id}`).expect(404);

      const adminUser = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.admin.email },
      });
      await http().get(`/teachers/${adminUser.id}`).expect(404);
      await http().get('/teachers/not-a-uuid').expect(400);
    });
  });

  describe('moderation (#100)', () => {
    it('an admin edits a profile and the change is audited', async () => {
      const teacher = await publishedProfile();
      const res = await http()
        .put(`/admin/teachers/${teacher.id}/profile`)
        .set('Cookie', admin)
        .send({ bio: 'Edited by moderation.', socialLinks: [] })
        .expect(200);
      expect(res.body.data).toMatchObject({ bio: 'Edited by moderation.', isPublished: true });

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          entityType: 'teacher_profile',
          entityId: teacher.id,
          action: 'TEACHER_PROFILE_EDITED_BY_ADMIN',
        },
      });
      expect(audit.details).toEqual({ fields: ['bio'] });
      const adminUser = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.admin.email },
      });
      expect(audit.actorUserId).toBe(adminUser.id);
    });

    it('an admin unpublishes with a reason; it is audited and the teacher sees why', async () => {
      const teacher = await publishedProfile();
      await http()
        .post(`/admin/teachers/${teacher.id}/profile/unpublish`)
        .set('Cookie', admin)
        .send({})
        .expect(400);
      const res = await http()
        .post(`/admin/teachers/${teacher.id}/profile/unpublish`)
        .set('Cookie', admin)
        .send({ reason: 'Contact details in bio' })
        .expect(200);
      expect(res.body.data.isPublished).toBe(false);
      await http().get(`/teachers/${teacher.id}`).expect(404);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: teacher.id, action: 'TEACHER_PROFILE_UNPUBLISHED_BY_ADMIN' },
      });
      expect(audit.details).toEqual({ reason: 'Contact details in bio' });

      const mine = await http().get('/teacher/profile').set('Cookie', teacher.cookie).expect(200);
      expect(mine.body.data.moderation).toEqual({
        unpublishedAt: expect.any(String),
        reason: 'Contact details in bio',
      });

      // Republishing after fixing it clears the note.
      await http().post('/teacher/profile/publish').set('Cookie', teacher.cookie).expect(200);
      await http().post('/teacher/profile/unpublish').set('Cookie', teacher.cookie).expect(200);
      const after = await http().get('/teacher/profile').set('Cookie', teacher.cookie).expect(200);
      expect(after.body.data.moderation).toBeNull();
    });

    it('an admin removes a photo, audited', async () => {
      const teacher = await newTeacher();
      await http()
        .post('/teacher/profile/photo')
        .set('Cookie', teacher.cookie)
        .attach('photo', PNG, 'me.png')
        .expect(200);
      const res = await http()
        .post(`/admin/teachers/${teacher.id}/profile/photo/remove`)
        .set('Cookie', admin)
        .send({ reason: 'Not a portrait' })
        .expect(200);
      expect(res.body.data.photoUrl).toBeNull();
      await prisma.auditLog.findFirstOrThrow({
        where: { entityId: teacher.id, action: 'TEACHER_PROFILE_PHOTO_REMOVED_BY_ADMIN' },
      });
    });

    it('is admin-only, and 404 for unknown users and non-teachers', async () => {
      const teacher = await newTeacher();
      const other = await newTeacher();
      await http().get(`/admin/teachers/${teacher.id}/profile`).expect(401);
      await http()
        .get(`/admin/teachers/${teacher.id}/profile`)
        .set('Cookie', other.cookie)
        .expect(403);
      await http()
        .put(`/admin/teachers/${teacher.id}/profile`)
        .set('Cookie', other.cookie)
        .send({ bio: 'hijack' })
        .expect(403);
      await http()
        .get('/admin/teachers/00000000-0000-4000-8000-000000000000/profile')
        .set('Cookie', admin)
        .expect(404);
      const adminUser = await prisma.user.findUniqueOrThrow({
        where: { email: SEEDED.admin.email },
      });
      await http().get(`/admin/teachers/${adminUser.id}/profile`).set('Cookie', admin).expect(404);
      await http().get(`/admin/teachers/${teacher.id}/profile`).set('Cookie', admin).expect(200);
    });
  });
});
