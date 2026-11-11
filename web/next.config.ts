import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin. `/api/*` is proxied to the NestJS API, so its
 * HTTP-only session cookie is first-party here and no CORS is needed.
 * API_URL is read when the config loads (`next dev`, `next build`, `next start`).
 */
const apiUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Headers for every page. Caddy only adds HSTS on the web domain, so the app sets the rest.
 * `frame-ancestors 'none'` (with X-Frame-Options for old browsers) stops clickjacking. It is the
 * only CSP directive set here: a full policy has to allow KaTeX, Turnstile and the Bunny player.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
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
