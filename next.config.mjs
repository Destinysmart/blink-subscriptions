/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client', 'ws', 'nostr-tools'],
  },
};
export default nextConfig;
