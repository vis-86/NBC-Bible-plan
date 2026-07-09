import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('bff app', () => {
  it('GET /app/api/health -> 204 no-store', async () => {
    const res = await createApp().request('/app/api/health');
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('unknown route -> 404', async () => {
    const res = await createApp().request('/app/api/nope');
    expect(res.status).toBe(404);
  });
});
