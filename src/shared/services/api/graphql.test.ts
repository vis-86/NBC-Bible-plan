import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphqlClient } from './graphql';

/**
 * T6: аудит 401-vs-network — graphqlClient не должен маппить сетевые ошибки в
 * session-expired/логаут. graphql.ts вообще не вызывает __onSessionExpired (в
 * отличие от client.ts), поэтому сетевой отказ и 401 оба просто пробрасываются
 * как Error — важно, чтобы это доходило до outbox-слоя необработанным (см.
 * sync.test.ts: attemptSend получает reject и оставляет запись в очереди).
 */
describe('graphqlClient network error handling', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    delete (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired;
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired;
  });

  it('fetch-reject (offline) пробрасывается как есть и НЕ трогает __onSessionExpired', async () => {
    const onExpired = vi.fn();
    (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired = onExpired;
    const networkError = new TypeError('Failed to fetch');
    global.fetch = vi.fn().mockRejectedValue(networkError);

    await expect(graphqlClient.mutate('mutation { noop }')).rejects.toBe(networkError);

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('401-ответ пробрасывается как Error и НЕ трогает __onSessionExpired (graphql.ts не завязан на этот callback)', async () => {
    const onExpired = vi.fn();
    (globalThis as { __onSessionExpired?: () => void }).__onSessionExpired = onExpired;
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));

    await expect(graphqlClient.mutate('mutation { noop }')).rejects.toThrow('Unauthorized');

    expect(onExpired).not.toHaveBeenCalled();
  });

  it('успешный запрос возвращает data', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 })
    );

    await expect(graphqlClient.query<{ ok: boolean }>('query { ok }')).resolves.toEqual({ ok: true });
  });
});
