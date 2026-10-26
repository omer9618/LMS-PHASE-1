import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { ENV } from '../../src/config/config.module';
import type { Env } from '../../src/config/env.schema';
import { generateOpaqueToken, hashOpaqueToken } from '../../src/modules/auth/domain/opaque-token';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Dev-only seed credentials; same env vars and defaults as prisma/seed.ts. */
/** The dev admin's authenticator secret (prisma/seed.ts). */
export const SEEDED_ADMIN_MFA_SECRET =
  process.env.SEED_ADMIN_MFA_SECRET ?? 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

export const SEEDED = {
  admin: {
    email: 'admin@lms.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'AdminPassword123!',
  },
  teacherA: {
    email: 'teacher.a@lms.local',
    password: process.env.SEED_TEACHER_PASSWORD ?? 'TeacherPassword123!',
  },
  teacherB: {
    email: 'teacher.b@lms.local',
    password: process.env.SEED_TEACHER_PASSWORD ?? 'TeacherPassword123!',
  },
};

/**
 * Logs in over HTTP and returns the Cookie header value.
 *
 * For MFA accounts (the seeded admin) the password step is real, but the second step is completed
 * by inserting an MFA-verified session directly: TOTP replay protection would otherwise reject the
 * many admin logins a test run makes inside one 30-second step. The genuine MFA flow is covered
 * by test/mfa.e2e-spec.ts.
 */
export async function loginAs(
  app: NestExpressApplication,
  credentials: { email: string; password: string },
): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(200);
  if (res.body.data.mfaRequired) return verifiedSessionCookie(app, credentials.email);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return setCookie[0].split(';')[0];
}

async function verifiedSessionCookie(app: NestExpressApplication, email: string): Promise<string> {
  const prisma = app.get(PrismaService);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = generateOpaqueToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      mfaVerifiedAt: new Date(),
    },
  });
  return `${app.get<Env>(ENV).SESSION_COOKIE_NAME}=${token}`;
}
