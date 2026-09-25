import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript-friendly ESM; Next compiles them in place.
  transpilePackages: ['@sprout/shared', '@sprout/srs', '@sprout/scoring'],
  experimental: {
    optimizePackageImports: ['recharts', 'framer-motion'],
  },
  async rewrites() {
    // Keep refresh cookies on the web origin when the API runs on another host.
    const apiOrigin = process.env.API_ORIGIN?.replace(/\/+$/, '');
    if (!apiOrigin) return [];
    const url = new URL(apiOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      throw new Error('API_ORIGIN must be an HTTP(S) origin without a path or credentials');
    }
    return [
      { source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${apiOrigin}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
