import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// SDK-функции возвращают дескриптор, который инспектируем в тесте.
vi.mock('@directus/sdk', () => ({
  readItems: (collection: string, opts: unknown) => ({ kind: 'list', collection, opts }),
  createItem: (collection: string, data: unknown) => ({ kind: 'create', collection, data }),
}));

vi.mock('./directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

import { addTeamMember, getTeamIdBySlug, getUserTeamId, NBC_TEAM_SLUG } from './teams';

beforeEach(() => {
  requestMock.mockReset();
});

describe('getUserTeamId', () => {
  it('фильтрует team_members по user и просит поле team', async () => {
    requestMock.mockResolvedValueOnce([{ team: 't-1' }]);

    await getUserTeamId('u-1');

    expect(requestMock.mock.calls[0][0]).toEqual({
      kind: 'list',
      collection: 'team_members',
      opts: { filter: { user: { _eq: 'u-1' } }, fields: ['team'], limit: 1 },
    });
  });

  it('team строкой -> строка', async () => {
    requestMock.mockResolvedValueOnce([{ team: 't-1' }]);
    expect(await getUserTeamId('u-1')).toBe('t-1');
  });

  it('team объектом { id } -> строка', async () => {
    requestMock.mockResolvedValueOnce([{ team: { id: 't-2' } }]);
    expect(await getUserTeamId('u-1')).toBe('t-2');
  });

  it('нет строки членства -> null', async () => {
    requestMock.mockResolvedValueOnce([]);
    expect(await getUserTeamId('u-1')).toBeNull();
  });

  it('пустой team -> null', async () => {
    requestMock.mockResolvedValueOnce([{ team: null }]);
    expect(await getUserTeamId('u-1')).toBeNull();
  });

  it('пустой id -> null без запроса', async () => {
    expect(await getUserTeamId('')).toBeNull();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('пробрасывает ошибку Directus', async () => {
    requestMock.mockRejectedValueOnce(new Error('directus down'));
    await expect(getUserTeamId('u-1')).rejects.toThrow('directus down');
  });
});

describe('getTeamIdBySlug', () => {
  it('фильтрует teams по slug и возвращает id', async () => {
    requestMock.mockResolvedValueOnce([{ id: 't-9' }]);

    expect(await getTeamIdBySlug(NBC_TEAM_SLUG)).toBe('t-9');
    expect(requestMock.mock.calls[0][0]).toEqual({
      kind: 'list',
      collection: 'teams',
      opts: { filter: { slug: { _eq: 'nbc' } }, fields: ['id'], limit: 1 },
    });
  });

  it('нет команды -> null', async () => {
    requestMock.mockResolvedValueOnce([]);
    expect(await getTeamIdBySlug('none')).toBeNull();
  });

  it('пробрасывает ошибку Directus', async () => {
    requestMock.mockRejectedValueOnce(new Error('directus down'));
    await expect(getTeamIdBySlug('nbc')).rejects.toThrow('directus down');
  });
});

describe('addTeamMember', () => {
  it('создаёт team_members с { team, user }', async () => {
    requestMock.mockResolvedValueOnce({});

    await addTeamMember('t-1', 'u-1');

    expect(requestMock.mock.calls[0][0]).toEqual({
      kind: 'create',
      collection: 'team_members',
      data: { team: 't-1', user: 'u-1' },
    });
  });

  it('пробрасывает ошибку Directus', async () => {
    requestMock.mockRejectedValueOnce(new Error('directus down'));
    await expect(addTeamMember('t-1', 'u-1')).rejects.toThrow('directus down');
  });
});
