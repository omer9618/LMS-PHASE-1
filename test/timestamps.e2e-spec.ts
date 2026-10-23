import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';

/**
 * Timestamps are timestamptz and must hold the true instant (#3). @prisma/adapter-pg sends
 * offset-less UTC strings, so the app's connections must run with TimeZone=UTC (createPgPool).
 */
describe('Timestamps are stored as the correct UTC instant', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs database sessions in UTC regardless of the server default', async () => {
    const [row] = await prisma.$queryRaw<
      { tz: string }[]
    >`SELECT current_setting('TimeZone') AS tz`;
    expect(row.tz).toBe('UTC');
  });

  it('stores the instant Prisma was given, as seen by raw SQL', async () => {
    const instant = new Date('2026-01-01T00:00:00.000Z');
    const email = `tz-${Date.now()}@test.local`;
    await prisma.user.create({ data: { email, passwordHash: 'x', createdAt: instant } });
    try {
      const [row] = await prisma.$queryRaw<{ epoch: number; type: string }[]>`
        SELECT extract(epoch FROM created_at)::float8 AS epoch, pg_typeof(created_at)::text AS type
        FROM users WHERE email = ${email}`;
      expect(row.type).toBe('timestamp with time zone');
      expect(row.epoch * 1000).toBe(instant.getTime());

      const back = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(back.createdAt.toISOString()).toBe(instant.toISOString());
    } finally {
      await prisma.user.delete({ where: { email } });
    }
  });
});
