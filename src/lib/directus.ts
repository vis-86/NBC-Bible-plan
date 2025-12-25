import { createDirectus, rest, authentication, staticToken, graphql } from '@directus/sdk';

const isServer = typeof window === 'undefined';

// На сервере используем прямой URL Directus
// На клиенте используем прокси, дополняя его до абсолютного URL через window.location
export const directusUrl = isServer 
  ? (process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055')
  : (typeof window !== 'undefined' ? window.location.origin : '') + '/api/directus';

export const directus = createDirectus(directusUrl)
  .with(authentication('cookie'))
  .with(rest({
    onRequest: (options) => ({ ...options, cache: 'no-store' }),
  }))
  .with(graphql());

export type DirectusClient = typeof directus;

