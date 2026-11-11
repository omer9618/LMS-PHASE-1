import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin. `/api/*` is proxied to the NestJS API, so its
 * HTTP-only session cookie is first-party here and no CORS is needed.
 * API_URL is read when the config loads (`next dev`, `next build`, `next start`).
 */
const apiUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Headers for every page. Caddy only adds HSTS on the web domain, so the app sets the rest.
 * The Content-Security-Policy is a static baseline that needs no per-request work:
 * `frame-ancestors 'none'` (with X-Frame-Options for old browsers) stops clickjacking,
 * `object-src 'none'` and `base-uri 'self'` close the plugin and <base> injection routes, and
 * `form-action 'self'` keeps a form from posting somewhere else.
 * There is no `script-src` on purpose. Next.js adds inline scripts, so a script policy needs a
 * per-request nonce (a `proxy.ts` and every page rendered dynamically, see "Content Security
 * Policy" in the Next.js docs) and has to allow Turnstile and the Bunny player. That is a
 * performance and caching trade to make deliberately; lesson maths is already rendered by KaTeX
 * with `trust: false`.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /web is its own package inside the API's repo: build from here, not from the repo root.
  turbopack: { root: __dirname },
  poweredByHeader: false,
  // Docker image (web/Dockerfile): a self-contained server.js with only the files it needs.
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
