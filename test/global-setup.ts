import 'dotenv/config';
import { execSync } from 'node:child_process';

/** Brings the test database up to date (migrations + idempotent seed) once per e2e run. */
export default function globalSetup(): void {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL is not set. See README "Running tests".');
  }
  const env = { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' });
  execSync('npx prisma db seed', { env, stdio: 'inherit' });
}
