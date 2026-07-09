import type { NextConfig } from "next";

const BFF_PORT = process.env.BFF_PORT || '3001';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/app';

/**
 * `phase` определяет режим сборки Next (`next dev` vs `next build`). `output: 'export'`
 * запрещает `rewrites` в production-сборке, поэтому dev-only проксирование
 * `{basePath}/api/*` → BFF (`yarn bff:dev`) добавляется только на PHASE_DEVELOPMENT_SERVER.
 */
const nextConfig = (phase: string): NextConfig => {
  const isDev = phase === 'phase-development-server';

  return {
    reactCompiler: true,
    output: 'export',
    basePath,
    assetPrefix: basePath,
    poweredByHeader: false,
    // Вычисляется один раз при запуске `next build` (или старте `next dev`) и инлайнится
    // в бандл — версия приложения для секции офлайн-настроек (Task 30). Docker-деплой
    // (deploy/Dockerfile) гоняет `yarn build` заново на каждой сборке образа, поэтому
    // отдельный ARG/ENV в Dockerfile не нужен.
    env: {
      NEXT_PUBLIC_APP_BUILD_TIME: new Date().toISOString(),
    },
    ...(isDev
      ? {
          async rewrites() {
            // `source` уже относительно basePath — Next сам добавляет его при матчинге.
            return [{ source: `/api/:path*`, destination: `http://localhost:${BFF_PORT}${basePath}/api/:path*` }];
          },
        }
      : {}),
  };
};

export default nextConfig;
