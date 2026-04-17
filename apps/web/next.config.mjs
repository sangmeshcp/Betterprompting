/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  transpilePackages: ["@betterprompting/db", "@betterprompting/analyzer"],
};

export default nextConfig;
