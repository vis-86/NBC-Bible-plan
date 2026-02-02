import { createDirectus, rest, authentication, staticToken, graphql } from '@directus/sdk';
import type { DirectusSchema } from './directus-schema';

const isServer = typeof window === 'undefined';

// Получаем basePath
function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

// На сервере используем прямой URL Directus
// На клиенте используем прокси, дополняя его до абсолютного URL через window.location с учетом basePath
export const directusUrl = isServer 
  ? (process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055')
  : (() => {
      const basePath = getBasePath();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return basePath ? `${origin}${basePath}/api/directus` : `${origin}/api/directus`;
    })();

export const directus = createDirectus<DirectusSchema>(directusUrl)
  .with(authentication('cookie'))
  .with(rest({
    onRequest: (options) => ({ ...options, cache: 'no-store' }),
  }))
  .with(graphql());

/**
 * Создает клиент Directus с административным доступом (только для сервера)
 */
export const getDirectusAdminClient = () => {
  const adminToken = process.env.DIRECTUS_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('DIRECTUS_ADMIN_TOKEN is not set');
  }

  return createDirectus<DirectusSchema>(process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055')
    .with(staticToken(adminToken))
    .with(rest());
};

export type DirectusClient = typeof directus;
export type DirectusAdminClient = ReturnType<typeof getDirectusAdminClient>;

