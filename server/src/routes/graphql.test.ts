import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

async function sessionCookie(directusId = 'user-1'): Promise<string> {
  const sealed = await sealSession({ directus_id: directusId, first_name: 'Test' });
  return `${SESSION_COOKIE_NAME}=${sealed}`;
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  process.env.NEXT_PUBLIC_DIRECTUS_URL = 'http://localhost:8055';
  requestMock.mockReset();
});

describe('POST /app/api/graphql', () => {
  it('401 без сессии', async () => {
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query GetDayProgress { getDayProgress }' }),
    });
    expect(res.status).toBe(401);
  });

  it('getDayProgress: нет записей -> count null', async () => {
    requestMock.mockResolvedValueOnce([]);
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ query: 'query GetDayProgress { getDayProgress }', variables: { day: 5 } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.getDayProgress).toEqual({ day: 5, count: null });
  });

  it('getDayProgress: есть запись -> count из последней записи', async () => {
    requestMock.mockResolvedValueOnce([{ id: '1', count: 3 }]);
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ query: 'query GetDayProgress { getDayProgress }', variables: { day: 5 } }),
    });
    const body = await res.json();
    expect(body.data.getDayProgress).toEqual({ day: 5, count: 3 });
  });

  it('updateProgress: создаёт запись, если её не было', async () => {
    requestMock.mockResolvedValueOnce([]); // readItems
    requestMock.mockResolvedValueOnce({ id: 'new' }); // createItem
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        query: 'mutation UpdateProgress { updateProgress }',
        variables: { day: 7, count: 2 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updateProgress).toEqual({ day: 7, count: 2, completedItems: null, success: true });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('updateProgressBatch: НЕ путается с updateProgress по substring-совпадению', async () => {
    requestMock.mockResolvedValueOnce([]); // readItems existing
    requestMock.mockResolvedValueOnce({ ids: ['a', 'b'] }); // createItems
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        query: 'mutation UpdateProgressBatch { updateProgressBatch }',
        variables: { days: [1, 2], completed: true },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.updateProgressBatch).toEqual({ days: [1, 2], completed: true, success: true });
  });

  it('400 без query', async () => {
    const cookie = await sessionCookie();
    const app = createApp();
    const res = await app.request('/app/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
