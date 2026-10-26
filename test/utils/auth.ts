import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

/** Dev-only seed credentials; same env vars and defaults as prisma/seed.ts. */
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

/** Logs in and returns the Set-Cookie value to send back as `Cookie`. */
export async function loginAs(
  app: NestExpressApplication,
  credentials: { email: string; password: string },
): Promise<string> {
  const res = await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(200);
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return setCookie[0].split(';')[0];
}
