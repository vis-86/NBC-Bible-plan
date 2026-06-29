import { describe, it, expect, vi, beforeEach } from 'vitest';

// Мокаем directus admin-клиент, чтобы isJtiUsed/consume не ходили в сеть.
const usedJtis = new Set<string>();
vi.mock('./directus', () => ({
  getDirectusAdminClient: () => ({
    request: (op: { __op: string; jti?: string }) => {
      if (op.__op === 'read') {
        return Promise.resolve([...usedJtis].filter((j) => j === op.jti).map((j) => ({ jti: j })));
      }
      if (op.__op === 'create') {
        usedJtis.add(op.jti!);
        return Promise.resolve({ jti: op.jti });
      }
      return Promise.resolve([]);
    },
  }),
}));

vi.mock('@directus/sdk', () => ({
  readItems: (_c: string, query: { filter?: { jti?: { _eq: string } } }) => ({
    __op: 'read',
    jti: query?.filter?.jti?._eq,
  }),
  createItem: (_c: string, data: { jti: string }) => ({ __op: 'create', jti: data.jti }),
}));

import { signInviteToken, verifyInviteToken, consumeToken } from './invite';

describe('invite tokens', () => {
  beforeEach(() => usedJtis.clear());

  it('verifies a freshly signed activate token', async () => {
    const token = signInviteToken({ kind: 'activate' });
    const payload = await verifyInviteToken(token);
    expect(payload?.kind).toBe('activate');
    expect(payload?.jti).toBeTruthy();
  });

  it('carries userId for reset tokens', async () => {
    const token = signInviteToken({ kind: 'reset', userId: 'user-123' });
    const payload = await verifyInviteToken(token);
    expect(payload?.kind).toBe('reset');
    expect(payload?.userId).toBe('user-123');
  });

  it('rejects a tampered signature', async () => {
    const token = signInviteToken({ kind: 'activate' });
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(await verifyInviteToken(tampered)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = signInviteToken({ kind: 'activate' }, -1); // exp в прошлом
    expect(await verifyInviteToken(token)).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyInviteToken('not-a-token')).toBeNull();
  });

  it('rejects an already-used token', async () => {
    const token = signInviteToken({ kind: 'activate' });
    const payload = await verifyInviteToken(token);
    await consumeToken(payload!.jti);
    expect(await verifyInviteToken(token)).toBeNull();
  });
});
