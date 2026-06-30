import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * In-memory мок коллекции Directus `auth_invites`.
 * readItems → фильтр (token + used_at null + expires_at>now), createItem → insert, updateItem → patch.
 */
interface Row {
  id: number;
  token: string;
  kind: string;
  user: string | null;
  label: string | null;
  expires_at: string;
  used_at: string | null;
  invite_url: string | null;
}

let rows: Row[] = [];
let nextId = 1;

interface ReadOp {
  __op: 'read';
  filter: {
    token?: { _eq: string };
    used_at?: { _null: boolean };
    expires_at?: { _gt: string };
  };
}
interface CreateOp { __op: 'create'; data: Omit<Row, 'id'> }
interface UpdateOp { __op: 'update'; id: number; data: Partial<Row> }
type Op = ReadOp | CreateOp | UpdateOp;

function rowMatches(row: Row, filter: ReadOp['filter']): boolean {
  if (filter.token?._eq !== undefined && row.token !== filter.token._eq) return false;
  if (filter.used_at?._null === true && row.used_at !== null) return false;
  // ISO 8601 строки одного формата сравниваются лексикографически как даты.
  if (filter.expires_at?._gt !== undefined && !(row.expires_at > filter.expires_at._gt)) return false;
  return true;
}

vi.mock('./directus', () => ({
  getDirectusAdminClient: () => ({
    request: (op: Op) => {
      if (op.__op === 'read') {
        return Promise.resolve(rows.filter((r) => rowMatches(r, op.filter)).slice(0, 1));
      }
      if (op.__op === 'create') {
        const row: Row = { id: nextId++, ...op.data };
        rows.push(row);
        return Promise.resolve(row);
      }
      if (op.__op === 'update') {
        const row = rows.find((r) => r.id === op.id);
        if (row) Object.assign(row, op.data);
        return Promise.resolve(row);
      }
      return Promise.resolve([]);
    },
  }),
}));

vi.mock('@directus/sdk', () => ({
  readItems: (_c: string, query: { filter: ReadOp['filter'] }): ReadOp => ({
    __op: 'read',
    filter: query.filter,
  }),
  createItem: (_c: string, data: Omit<Row, 'id'>): CreateOp => ({ __op: 'create', data }),
  updateItem: (_c: string, id: number, data: Partial<Row>): UpdateOp => ({ __op: 'update', id, data }),
}));

import { createInvite, findValidInvite, consumeInvite } from './invite';

describe('DB-backed invites', () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it('creates an activate invite and finds it valid', async () => {
    const { token, url } = await createInvite({ kind: 'activate' });
    expect(url).toContain('/activate?token=');
    expect(url).toContain('mode=activate');

    const invite = await findValidInvite(token);
    expect(invite?.kind).toBe('activate');
    expect(invite?.user).toBeNull();
    expect(invite?.id).toBeTruthy();
  });

  it('carries user for reset invites', async () => {
    const { token } = await createInvite({ kind: 'reset', userId: 'user-123' });
    const invite = await findValidInvite(token);
    expect(invite?.kind).toBe('reset');
    expect(invite?.user).toBe('user-123');
  });

  it('returns null for an unknown token', async () => {
    expect(await findValidInvite('no-such-token')).toBeNull();
  });

  it('returns null for an empty token', async () => {
    expect(await findValidInvite('')).toBeNull();
  });

  it('rejects an expired invite', async () => {
    const { token } = await createInvite({ kind: 'activate', ttlSeconds: -1 });
    expect(await findValidInvite(token)).toBeNull();
  });

  it('rejects an already-consumed invite', async () => {
    const { token } = await createInvite({ kind: 'activate' });
    const invite = await findValidInvite(token);
    await consumeInvite(invite!.id);
    expect(await findValidInvite(token)).toBeNull();
  });

  it('binds the created user on activate consume', async () => {
    const { token } = await createInvite({ kind: 'activate' });
    const invite = await findValidInvite(token);
    await consumeInvite(invite!.id, 'new-user-42');

    const row = rows.find((r) => r.id === invite!.id)!;
    expect(row.used_at).toBeTruthy();
    expect(row.user).toBe('new-user-42');
  });
});
