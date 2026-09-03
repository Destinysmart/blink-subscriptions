/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'ws', 'nostr-tools'],
  },
  async headers() {
    return [
      {
        // the subscribe box is embedded via iframe on other sites — allow that
        source: '/embed/:path*',
        headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
      },
    ];
  },
};
export default nextConfig;
