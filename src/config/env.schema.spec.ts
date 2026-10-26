import { envSchema } from './env.schema';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

const productionOk = {
  ...base,
  NODE_ENV: 'production',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'lms-files',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  STORAGE_SIGNING_SECRET: 'p'.repeat(40),
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CAPTCHA_PROVIDER: 'turnstile',
  CAPTCHA_SECRET_KEY: 'turnstile-secret',
};

const failingPaths = (input: Record<string, string>) => {
  const result = envSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('env schema', () => {
  it('accepts a minimal development config with dev conveniences', () => {
    const env = envSchema.parse(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      EMAIL_TRANSPORT: 'log',
      STORAGE_DRIVER: 'local',
      COOKIE_SECURE: false,
    });
  });

  it('accepts a complete production config, with secure cookies on', () => {
    expect(envSchema.parse(productionOk).COOKIE_SECURE).toBe(true);
  });

  it('refuses dev-only email and storage in production', () => {
    expect(failingPaths({ ...productionOk, EMAIL_TRANSPORT: 'log' })).toContain('EMAIL_TRANSPORT');
    expect(failingPaths({ ...productionOk, STORAGE_DRIVER: 'local' })).toContain('STORAGE_DRIVER');
  });

  it('requires the provider settings for smtp and s3', () => {
    const { SMTP_URL: _smtp, S3_BUCKET: _bucket, ...missing } = productionOk;
    expect(failingPaths(missing)).toEqual(expect.arrayContaining(['SMTP_URL', 'S3_BUCKET']));
  });

  it('refuses the dev storage signing secret and insecure cookies in production', () => {
    const { STORAGE_SIGNING_SECRET: _secret, ...rest } = productionOk;
    expect(failingPaths(rest)).toContain('STORAGE_SIGNING_SECRET');
    expect(failingPaths({ ...productionOk, COOKIE_SECURE: 'false' })).toContain('COOKIE_SECURE');
    const { MFA_ENCRYPTION_KEY: _mfa, ...noMfaKey } = productionOk;
    expect(failingPaths(noMfaKey)).toContain('MFA_ENCRYPTION_KEY');
    expect(failingPaths({ ...productionOk, MFA_ENCRYPTION_KEY: 'c2hvcnQ=' })).toContain(
      'MFA_ENCRYPTION_KEY',
    );
  });
});
