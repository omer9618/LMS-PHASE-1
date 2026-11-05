import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin. `/api/*` is proxied to the NestJS API, so its
 * HTTP-only session cookie is first-party here and no CORS is needed.
 * API_URL is read when the config loads (`next dev`, `next build`, `next start`).
 */
const apiUrl = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // /web is its own package inside the API's repo: build from here, not from the repo root.
  turbopack: { root: __dirname },
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
