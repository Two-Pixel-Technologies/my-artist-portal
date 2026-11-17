const API = process.env.API_URL || 'http://127.0.0.1:4000';

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The browser only ever talks to the Next origin; API calls are proxied so cookies stay same-origin.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/media/:path*', destination: `${API}/media/:path*` },
      { source: '/go/:path*', destination: `${API}/go/:path*` },
    ];
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/review/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
};
export default config;
