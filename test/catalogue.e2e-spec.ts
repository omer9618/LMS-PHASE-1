import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { loginAs, SEEDED } from './utils/auth';
import { classification, Classification, createCourse } from './utils/courses';
import { uniqueEmail } from './utils/email';
import { createTestApp } from './utils/test-app';

describe('Catalogue (#40–#44)', () => {
  let app: NestExpressApplication;
  let teacher: string;
  let admin: string;
  let ids: Classification;
  let prisma: PrismaService;
  /** A token unique to this run, so searches only see courses created here. */
  const tag = `zq${Date.now().toString(36)}`;
  const http = () => request(app.getHttpServer());

  async function publishedCourse(
    title: string,
    pricing: { isFree: true } | { isFree: false; priceMinor: string },
    cookie = teacher,
  ) {
    const course = await createCourse(app, cookie, ids, `${title} ${tag}`);
    await http().post(`/teacher/courses/${course.id}/submit`).set('Cookie', cookie).expect(200);
    await http()
      .put(`/admin/courses/${course.id}/pricing`)
      .set('Cookie', admin)
      .send(pricing.isFree ? pricing : { ...pricing, currency: 'PKR', commissionRateBps: 2000 })
      .expect(200);
    await http().post(`/admin/courses/${course.id}/approve`).set('Cookie', admin).expect(200);
    return course.id as string;
  }

  let freeId: string;
  let cheapId: string;
  let dearId: string;

  beforeAll(async () => {
    app = await createTestApp();
    teacher = await loginAs(app, SEEDED.teacherA);
    admin = await loginAs(app, SEEDED.admin);
    ids = await classification(app);
    prisma = app.get(PrismaService);
    freeId = await publishedCourse('Free Waves', { isFree: true });
    cheapId = await publishedCourse('Cheap Optics', { isFree: false, priceMinor: '100000' });
    dearId = await publishedCourse('Dear Quantum', { isFree: false, priceMinor: '900000' });
  });

  afterAll(async () => {
    await app.close();
  });

  const search = (query: Record<string, string>) =>
    http()
      .get('/catalogue/courses')
      .query({ q: tag, ...query });
  const idsOf = (res: request.Response) => res.body.data.items.map((c: { id: string }) => c.id);

  it('lists published courses newest first, stating the criterion, with no internal pricing fields', async () => {
    const res = await search({}).expect(200);
    expect(idsOf(res)).toEqual([dearId, cheapId, freeId]);
    expect(res.body.data).toMatchObject({ total: 3, ordering: expect.stringMatching(/Newest/) });
    const card = res.body.data.items[1];
    expect(card).toMatchObject({
      priceMinor: '100000',
      currency: 'PKR',
      teacher: { fullName: 'Teacher A' },
    });
    expect(card).not.toHaveProperty('commissionRateBps');
    expect(card).not.toHaveProperty('teacherProposedBps');
    expect(card).not.toHaveProperty('pricedById');
  });

  it('searches teacher name and subject too (#41)', async () => {
    const byTeacher = await http()
      .get('/catalogue/courses')
      .query({ q: 'Teacher A', limit: '60' })
      .expect(200);
    expect(idsOf(byTeacher)).toEqual(expect.arrayContaining([freeId, cheapId, dearId]));
    const subject = await prisma.subject.findUniqueOrThrow({ where: { id: ids.subjectId } });
    const bySubject = await http()
      .get('/catalogue/courses')
      .query({ q: subject.name.slice(0, 8), limit: '60' })
      .expect(200);
    expect(idsOf(bySubject)).toEqual(expect.arrayContaining([freeId]));
  });

  it('filters by price, free-only and pacing, combined (#42)', async () => {
    expect(idsOf(await search({ free: 'true' }).expect(200))).toEqual([freeId]);
    expect(idsOf(await search({ minPriceMinor: '500000' }).expect(200))).toEqual([dearId]);
    expect(idsOf(await search({ maxPriceMinor: '500000' }).expect(200))).toEqual([cheapId]);
    expect(idsOf(await search({ minPriceMinor: '9', maxPriceMinor: '1' }).expect(200))).toEqual([]);
    expect(idsOf(await search({ pacing: 'SEQUENTIAL' }).expect(200))).toEqual([]);
    expect(
      idsOf(await search({ subjectId: ids.subjectId, boardId: ids.boardId }).expect(200)),
    ).toHaveLength(3);
  });

  it('sorts by price with free courses first, or by title', async () => {
    expect(idsOf(await search({ sort: 'price_asc' }).expect(200))).toEqual([
      freeId,
      cheapId,
      dearId,
    ]);
    expect(idsOf(await search({ sort: 'price_desc' }).expect(200))).toEqual([
      dearId,
      cheapId,
      freeId,
    ]);
    expect(idsOf(await search({ sort: 'title' }).expect(200))).toEqual([cheapId, dearId, freeId]);
  });

  it('shows course detail with syllabus coverage and the demo, but no lesson content (#43)', async () => {
    const res = await http().get(`/catalogue/courses/${cheapId}`).expect(200);
    const detail = res.body.data;
    expect(detail).toMatchObject({
      id: cheapId,
      priceMinor: '100000',
      teacher: { fullName: 'Teacher A', profile: null },
      lessonCount: 1,
    });
    expect(detail.outline[0].lessons[0]).toEqual({
      id: expect.any(String),
      title: 'Welcome video',
      type: 'VIDEO',
      isFreePreview: true,
      durationSeconds: null,
    });
    expect(detail.demoLessonIds).toEqual([detail.outline[0].lessons[0].id]);
    expect(JSON.stringify(detail)).not.toMatch(/bodyText|providerVideoId|commission/);
  });

  it('never lists or opens drafts, PD courses, or courses of suspended teachers', async () => {
    const draft = await createCourse(app, teacher, ids, `Hidden draft ${tag}`);
    await http().get(`/catalogue/courses/${draft.id}`).expect(404);

    const pd = await publishedCourse('PD course', { isFree: true });
    await prisma.course.update({ where: { id: pd }, data: { audienceType: 'TEACHER_PD' } });
    await http().get(`/catalogue/courses/${pd}`).expect(404);

    // A teacher who is later suspended (#22): their published course disappears.
    const email = uniqueEmail('cat-teacher');
    const created = await http()
      .post('/admin/users')
      .set('Cookie', admin)
      .send({ email, fullName: 'Soon Suspended', roles: ['TEACHER'] })
      .expect(201);
    await prisma.user.update({
      where: { id: created.body.data.id },
      data: {
        passwordHash: (
          await prisma.user.findUniqueOrThrow({ where: { email: SEEDED.teacherA.email } })
        ).passwordHash,
      },
    });
    const cookie = await loginAs(app, { email, password: SEEDED.teacherA.password });
    const theirs = await publishedCourse('Suspended teacher course', { isFree: true }, cookie);
    await http().get(`/catalogue/courses/${theirs}`).expect(200);
    await http()
      .post(`/admin/users/${created.body.data.id}/suspend`)
      .set('Cookie', admin)
      .send({ reason: 'Catalogue test' })
      .expect(200);
    await http().get(`/catalogue/courses/${theirs}`).expect(404);

    expect(idsOf(await search({ limit: '60' }).expect(200))).toEqual([dearId, cheapId, freeId]);
  });

  it('lists subjects that have courses, with counts (#40)', async () => {
    const res = await http().get('/catalogue/subjects').expect(200);
    const subject = res.body.data.find((s: { id: string }) => s.id === ids.subjectId);
    expect(subject.courseCount).toBeGreaterThanOrEqual(3);
  });

  it('validates query parameters', async () => {
    await http().get('/catalogue/courses').query({ sort: 'popular' }).expect(400);
    await http().get('/catalogue/courses').query({ minPriceMinor: '1.5' }).expect(400);
  });
});
