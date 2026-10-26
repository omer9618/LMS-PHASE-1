import 'dotenv/config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Points every e2e test at TEST_DATABASE_URL, never the dev database.
 * Runs in each test worker before the test file is loaded.
 */
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. See README "Running tests".');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
// Emails are captured in memory (tests read links from them); files go to a temp directory.
process.env.EMAIL_TRANSPORT = 'memory';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = join(tmpdir(), 'lms-e2e-storage');
