const SENSITIVE_KEY = /password|token|secret|cookie|authorization/i;
const MAX_DEPTH = 6;

/** Deep copy of `value` with sensitive keys replaced, for logging request bodies. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[Redacted]' : redact(item, depth + 1),
    ]),
  );
}

/** pino `redact` paths for the request/response logs written by pino-http. */
export const PINO_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];
