import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
  it('204, no-store, без тела', async () => {
    const res = await GET();
    expect(res.status).toBe(204);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('');
  });
});
