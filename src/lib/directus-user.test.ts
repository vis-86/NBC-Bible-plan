import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { requestMock, addTeamMemberMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  addTeamMemberMock: vi.fn(),
}));

// SDK-функции возвращают дескриптор, который инспектируем в тесте.
vi.mock('@directus/sdk', () => ({
  readItems: (collection: string, query: unknown) => ({ op: 'readItems', collection, query }),
  createItem: (collection: string, data: unknown) => ({ op: 'createItem', collection, data }),
  readUser: (id: string, query: unknown) => ({ op: 'readUser', id, query }),
  updateUser: (id: string, data: unknown) => ({ op: 'updateUser', id, data }),
  readUsers: (query: unknown) => ({ op: 'readUsers', query }),
  readRoles: (query: { filter: { name: { _eq: string } } }) => ({ op: 'readRoles', name: query.filter.name._eq }),
  createUser: (data: unknown) => ({ op: 'createUser', data }),
  deleteUser: (id: string) => ({ op: 'deleteUser', id }),
}));

vi.mock('./directus', () => ({
  getDirectusAdminClient: () => ({ request: requestMock }),
}));

vi.mock('./teams', () => ({
  addTeamMember: addTeamMemberMock,
}));

import { createLocalUser, getUserStatus, loginToEmail, LOCAL_EMAIL_DOMAIN } from './directus-user';

type Op = { op: string; name?: string; data?: { role?: string | null }; id?: string };

/** Directus: логин свободен, роль находится по имени, createUser отдаёт `user-new`. */
function directusOk(overrides: Partial<Record<string, (op: Op) => unknown>> = {}) {
  requestMock.mockImplementation(async (op: Op) => {
    const override = overrides[op.op];
    if (override) return override(op);
    switch (op.op) {
      case 'readUsers':
        return [];
      case 'readRoles':
        return [{ id: `role-id:${op.name}` }];
      case 'createUser':
        return { id: 'user-new' };
      case 'deleteUser':
        return undefined;
      default:
        throw new Error(`unexpected op ${op.op}`);
    }
  });
}

function opsOf(name: string): Op[] {
  return requestMock.mock.calls.map(([op]) => op as Op).filter((op) => op.op === name);
}

describe('loginToEmail', () => {
  it('appends the synthetic domain for a bare handle', () => {
    expect(loginToEmail('ivan_nbc')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('lowercases the handle', () => {
    expect(loginToEmail('Ivan_NBC')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('passes through an explicit email (backward-compat)', () => {
    expect(loginToEmail('admin@example.com')).toBe('admin@example.com');
  });

  it('uses a domain with a real TLD (Directus rejects single-label like @local)', () => {
    // Регрессия: Directus валидирует формат email и отклоняет домены без точки
    // ("Value has to be a valid email address") → создание аккаунта падало с 500.
    const domain = loginToEmail('x').split('@')[1];
    expect(domain).toContain('.');
    expect(domain).not.toBe('local');
  });
});

describe('createLocalUser', () => {
  beforeEach(() => {
    requestMock.mockReset();
    addTeamMemberMock.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('по умолчанию — роль «Чтец» и членство в переданной команде', async () => {
    directusOk();

    const id = await createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1' });

    expect(id).toBe('user-new');
    expect(opsOf('readRoles').map((op) => op.name)).toEqual(['Чтец']);
    expect(opsOf('createUser')[0].data?.role).toBe('role-id:Чтец');
    expect(addTeamMemberMock).toHaveBeenCalledWith('team-1', 'user-new');
  });

  it('appRole задаёт роль Directus по APP_ROLE_TO_DIRECTUS_ROLE', async () => {
    directusOk();

    await createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-2', appRole: 'team_admin' });

    expect(opsOf('readRoles').map((op) => op.name)).toEqual(['team_admin']);
    expect(opsOf('createUser')[0].data?.role).toBe('role-id:team_admin');
    expect(addTeamMemberMock).toHaveBeenCalledWith('team-2', 'user-new');
  });

  it('занятый логин — ни пользователя, ни членства', async () => {
    directusOk({ readUsers: () => [{ id: 'someone' }] });

    await expect(
      createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1' }),
    ).rejects.toThrow('Login already taken');
    expect(opsOf('createUser')).toHaveLength(0);
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it('членство не создалось — пользователь удаляется, наружу исходная ошибка', async () => {
    directusOk();
    const membershipError = new Error('team_members insert failed');
    addTeamMemberMock.mockRejectedValueOnce(membershipError);

    await expect(
      createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1' }),
    ).rejects.toBe(membershipError);
    expect(opsOf('deleteUser')).toEqual([{ op: 'deleteUser', id: 'user-new' }]);
  });

  it('сбой удаления не подменяет исходную ошибку и логируется', async () => {
    directusOk({
      deleteUser: () => {
        throw new Error('delete failed');
      },
    });
    const membershipError = new Error('team_members insert failed');
    addTeamMemberMock.mockRejectedValueOnce(membershipError);

    await expect(
      createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1' }),
    ).rejects.toBe(membershipError);
    expect(opsOf('deleteUser')).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to remove user'),
      'user-new',
      expect.objectContaining({ message: 'delete failed' }),
    );
  });

  it('роли Directus для музыканта нет — ошибка, пользователь не создаётся', async () => {
    directusOk({ readRoles: () => [] });

    await expect(
      createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1', appRole: 'team_admin' }),
    ).rejects.toThrow('Directus role not found: team_admin');
    expect(opsOf('createUser')).toHaveLength(0);
    expect(addTeamMemberMock).not.toHaveBeenCalled();
  });

  it('роли «Чтец» нет — пользователь создаётся без роли, как раньше', async () => {
    directusOk({ readRoles: () => [] });

    expect(await createLocalUser({ login: 'ivan', password: 'secret123', teamId: 'team-1' })).toBe('user-new');
    expect(opsOf('createUser')[0].data?.role).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('getUserStatus', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('возвращает status пользователя', async () => {
    requestMock.mockResolvedValueOnce([{ status: 'suspended' }]);
    expect(await getUserStatus('user-9')).toBe('suspended');
    expect(requestMock.mock.calls[0][0]).toEqual({
      op: 'readUsers',
      query: { filter: { id: { _eq: 'user-9' } }, limit: 1, fields: ['status'] },
    });
  });

  it('пользователя нет -> null', async () => {
    requestMock.mockResolvedValueOnce([]);
    expect(await getUserStatus('user-9')).toBeNull();
  });
});
