import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Dev/test-only signing secret for the local storage driver. Rejected in production. */
const DEV_STORAGE_SIGNING_SECRET = 'dev-only-local-storage-signing-secret-change-me';
/** Dev/test-only MFA encryption key (32 ASCII bytes, base64). Rejected in production. */
export const DEV_MFA_ENCRYPTION_KEY = Buffer.from('dev-only-mfa-key-do-not-use-prod').toString(
  'base64',
);

/**
 * Every environment variable the app reads, validated once at startup.
 * There are no fallbacks for secrets or connection strings in production: a missing value is a
 * crash, not a default. Dev-only conveniences (log email, local disk storage) are refused there.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    // Number of reverse proxies in front of the app (0 = none). Controls req.ip.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    // Public base URLs: the web app (links in emails) and this API (local file links).
    APP_PUBLIC_URL: z.url().default('http://localhost:3001'),
    API_PUBLIC_URL: z.url().default('http://localhost:3000'),

    // Sessions (#12). In production use SESSION_COOKIE_NAME=__Host-lms_session.
    SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[\w-]+$/)
      .default('lms_session'),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
    SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(720),
    COOKIE_SECURE: booleanString.optional(),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    // MFA (#16). 32 random bytes, base64: `openssl rand -base64 32`.
    MFA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded')
      .default(DEV_MFA_ENCRYPTION_KEY),
    MFA_ISSUER: z.string().min(1).max(40).default('LMS'),

    // Email (#110). smtp in production; log prints emails; memory is for tests.
    EMAIL_TRANSPORT: z.enum(['smtp', 'log', 'memory']).default('log'),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    EMAIL_FROM: z.string().min(3).default('LMS <no-reply@lms.local>'),

    // File storage (#19, #38). s3 in production; local writes to disk for development.
    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    STORAGE_SIGNING_SECRET: z.string().min(32).default(DEV_STORAGE_SIGNING_SECRET),
    S3_BUCKET: z.string().min(3).optional(),
    S3_REGION: z.string().default('auto'),
    S3_ENDPOINT: z.url().optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: booleanString.default(false),
  })
  .transform((env) => ({
    ...env,
    // Secure cookies unless explicitly disabled; always on in production.
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }))
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const production = env.NODE_ENV === 'production';

    if (production && !env.COOKIE_SECURE) issue('COOKIE_SECURE', 'must be true in production');
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      issue('COOKIE_SAMESITE', 'SameSite=None requires COOKIE_SECURE=true');
    }

    if (production && env.EMAIL_TRANSPORT !== 'smtp') {
      issue('EMAIL_TRANSPORT', 'must be smtp in production');
    }
    if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL) {
      issue('SMTP_URL', 'is required when EMAIL_TRANSPORT=smtp');
    }

    if (production && env.STORAGE_DRIVER !== 's3') {
      issue('STORAGE_DRIVER', 'must be s3 in production (files never live on the app server)');
    }
    if (production && env.MFA_ENCRYPTION_KEY === DEV_MFA_ENCRYPTION_KEY) {
      issue('MFA_ENCRYPTION_KEY', 'must be set in production');
    }
    if (production && env.STORAGE_SIGNING_SECRET === DEV_STORAGE_SIGNING_SECRET) {
      issue('STORAGE_SIGNING_SECRET', 'must be set in production');
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) issue(key, 'is required when STORAGE_DRIVER=s3');
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
