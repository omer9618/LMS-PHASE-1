import 'dotenv/config';

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
