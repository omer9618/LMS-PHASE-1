import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { loginAs, SEEDED } from './utils/auth';
import { createTestApp } from './utils/test-app';

describe('Admin platform: settings editor (#8) and audit log viewer (#108)', () => {
  let app: NestExpressApplication;
  let admin: string;
  let teacher: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAs(app, SEEDED.admin);
    teacher = await loginAs(app, SEEDED.teacherA);
  });

  afterAll(async () => {
    // Leave the shared test database with the default value.
    await http()
      .put('/admin/settings/ORDER_EXPIRY_WINDOW_HOURS')
      .set('Cookie', admin)
      .send({ value: 48 });
    await app.close();
  });

  it('lists every setting with its value, default and description', async () => {
    const res = await http().get('/admin/settings').set('Cookie', admin).expect(200);
    const keys = res.body.data.map((s: { key: string }) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'VIDEO_COMPLETION_THRESHOLD_PCT',
        'ORDER_EXPIRY_WINDOW_HOURS',
        'PAYOUT_DISPUTE_WINDOW_DAYS',
      ]),
    );
    expect(res.body.data[0]).toMatchObject({
      value: expect.any(Number),
      defaultValue: expect.any(Number),
      description: expect.any(String),
    });
  });

  it('updates a setting without a deploy, records who did it, and audits the change', async () => {
    const res = await http()
      .put('/admin/settings/ORDER_EXPIRY_WINDOW_HOURS')
      .set('Cookie', admin)
      .send({ value: 72 })
      .expect(200);
    expect(res.body.data).toMatchObject({
      key: 'ORDER_EXPIRY_WINDOW_HOURS',
      value: 72,
      isDefault: false,
      updatedBy: { email: SEEDED.admin.email },
    });

    const audit = await http()
      .get('/admin/audit-log?action=SETTING_UPDATED&limit=5')
      .set('Cookie', admin)
      .expect(200);
    expect(audit.body.data.items[0]).toMatchObject({
      action: 'SETTING_UPDATED',
      entityType: 'platform_setting',
      details: { key: 'ORDER_EXPIRY_WINDOW_HOURS', to: '72' },
      actor: { email: SEEDED.admin.email },
      ipAddress: expect.any(String),
    });
  });

  it('rejects invalid values and unknown keys', async () => {
    await http()
      .put('/admin/settings/ORDER_EXPIRY_WINDOW_HOURS')
      .set('Cookie', admin)
      .send({ value: -1 })
      .expect(400);
    await http()
      .put('/admin/settings/NOT_A_SETTING')
      .set('Cookie', admin)
      .send({ value: 1 })
      .expect(404);
  });

  it('filters the audit log by actor email and entity type, with paging metadata', async () => {
    const res = await http()
      .get(`/admin/audit-log?actorEmail=${SEEDED.admin.email}&entityType=platform_setting&limit=2`)
      .set('Cookie', admin)
      .expect(200);
    expect(res.body.data).toMatchObject({ limit: 2, offset: 0, total: expect.any(Number) });
    expect(
      res.body.data.items.every((e: { entityType: string }) => e.entityType === 'platform_setting'),
    ).toBe(true);
  });

  it('is admin-only', async () => {
    await http().get('/admin/settings').set('Cookie', teacher).expect(403);
    await http().get('/admin/audit-log').set('Cookie', teacher).expect(403);
  });
});
