import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/app',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '/app',
  poweredByHeader: false,
  // Вычисляется один раз при запуске `next build` (или старте `next dev`) и инлайнится
  // в бандл — версия приложения для секции офлайн-настроек (Task 30). Docker-деплой
  // (deploy/Dockerfile) гоняет `yarn build` заново на каждой сборке образа, поэтому
  // отдельный ARG/ENV в Dockerfile не нужен.
  env: {
    NEXT_PUBLIC_APP_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
