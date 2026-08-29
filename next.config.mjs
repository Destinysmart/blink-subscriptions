/** @type {import('next').NextConfig} */
const nextConfig = {
  // engine imports node-only libs (ws, nostr-tools); keep them external to the server bundle
  serverExternalPackages: ['ws', 'nostr-tools'],
};
export default nextConfig;
