import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/app',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '/app',
  poweredByHeader: false,
};

export default nextConfig;
