/**
 * Управление командой: гейт `team_admin`, границы команды для `:userId`, запрет на себя,
 * команда инвайта — только из сессии. Directus — таблицы в памяти, применяющие фильтры
 * так же, как настоящий.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { adminRequestMock, getUserTeamIdMock } = vi.hoisted(() => ({
  adminRequestMock: vi.fn(),
  getUserTeamIdMock: vi.fn(),
}));

vi.mock('../../../src/lib/directus', () => ({
  getDirectusAdminClient: () => ({ request: adminRequestMock }),
}));
vi.mock('../../../src/lib/teams', () => ({
  getUserTeamId: getUserTeamIdMock,
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

const ADMIN_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const MEMBER_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const ADMIN_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const MEMBER_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const NOBODY = 'cccccccc-0000-4000-8000-000000000009';

type User = { id: string; email: string; first_name: string; status: string; role: string };
type Membership = { id: number; team: string; user: string };

const ROLES = [
  { id: 'role-reader', name: 'Чтец' },
  { id: 'role-musician', name: 'musician' },
  { id: 'role-editor', name: 'musician_editor' },
  { id: 'role-admin', name: 'team_admin' },
];

let users: Record<string, User>;
let memberships: Membership[];
let invites: Array<Record<string, unknown>>;

function user(id: string, login: string, role: string): User {
  return { id, email: `${login}@local.baptistnn.ru`, first_name: login.toUpperCase(), status: 'active', role };
}

type DirectusCommand = () => {
  path: string;
  method: string;
  params?: { fields?: string[]; filter?: Record<string, { _eq?: unknown }> };
  body?: string;
};

/** uuid в Postgres сравнивается без учёта регистра — фейк делает так же. */
function sameId(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function fakeDirectus(command: DirectusCommand) {
  const { path, method, params, body } = command();
  const filter = params?.filter ?? {};

  const userPath = path.match(/^\/users\/([^/]+)$/);
  if (userPath) {
    const target = Object.values(users).find((u) => sameId(u.id, userPath[1]));
    if (!target) throw Object.assign(new Error('Forbidden'), { response: { status: 403 } });
    if (method === 'GET') return { role: { name: target.role } };
    if (method === 'PATCH') {
      const patch = JSON.parse(body ?? '{}') as { role?: string; status?: string };
      if (patch.role !== undefined) target.role = ROLES.find((r) => r.id === patch.role)?.name ?? 'unknown';
      if (patch.status !== undefined) target.status = patch.status;
      return { id: target.id };
    }
  }

  if (path === '/items/teams' && method === 'GET') {
    return [
      { id: 'team-a', name: 'Команда A' },
      { id: 'team-b', name: 'Команда B' },
    ].filter((t) => filter.id?._eq === undefined || t.id === filter.id._eq);
  }

  if (path === '/items/team_members' && method === 'GET') {
    const rows = memberships.filter(
      (m) =>
        (filter.team?._eq === undefined || m.team === filter.team._eq) &&
        (filter.user?._eq === undefined || sameId(m.user, filter.user._eq)),
    );
    if (params?.fields?.includes('user.id')) {
      return rows.map((m) => {
        const u = users[m.user];
        return { user: { id: u.id, email: u.email, first_name: u.first_name, status: u.status, role: { name: u.role } } };
      });
    }
    return rows.map((m) => ({ id: m.id }));
  }

  const membershipPath = path.match(/^\/items\/team_members\/(\d+)$/);
  if (membershipPath && method === 'DELETE') {
    memberships = memberships.filter((m) => m.id !== Number(membershipPath[1]));
    return undefined;
  }

  if (path === '/roles' && method === 'GET') {
    return ROLES.filter((r) => r.name === filter.name?._eq);
  }

  if (path === '/items/auth_invites' && method === 'POST') {
    invites.push(JSON.parse(body ?? '{}'));
    return {};
  }

  throw new Error(`unexpected Directus call ${method} ${path}`);
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  users = {
    [ADMIN_A]: user(ADMIN_A, 'admin-a', 'team_admin'),
    [MEMBER_A]: user(MEMBER_A, 'member-a', 'musician'),
    [ADMIN_B]: user(ADMIN_B, 'admin-b', 'team_admin'),
    [MEMBER_B]: user(MEMBER_B, 'member-b', 'musician'),
  };
  memberships = [
    { id: 1, team: 'team-a', user: ADMIN_A },
    { id: 2, team: 'team-a', user: MEMBER_A },
    { id: 3, team: 'team-b', user: ADMIN_B },
    { id: 4, team: 'team-b', user: MEMBER_B },
  ];
  invites = [];
  adminRequestMock.mockReset();
  adminRequestMock.mockImplementation(async (command: DirectusCommand) => fakeDirectus(command));
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockImplementation(async (id: string) => memberships.find((m) => m.user === id)?.team ?? null);
});

async function call(method: string, path: string, as?: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (as) {
    const sealed = await sealSession({ directus_id: as, first_name: 'Test' });
    headers.Cookie = `${SESSION_COOKIE_NAME}=${sealed}`;
  }
  return createApp().request(`/app/api/team${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Состояние «никто ничего не записал»: роли, статусы и членства как в beforeEach. */
function expectNoWrites() {
  expect(invites).toEqual([]);
  expect(memberships).toHaveLength(4);
  expect(Object.values(users).map((u) => [u.role, u.status])).toEqual([
    ['team_admin', 'active'],
    ['musician', 'active'],
    ['team_admin', 'active'],
    ['musician', 'active'],
  ]);
}

const ADMIN_ENDPOINTS: Array<[string, string, unknown?]> = [
  ['GET', '/members'],
  ['POST', '/invites', { role: 'musician' }],
  ['POST', `/members/${MEMBER_A}/reset`],
  ['PATCH', `/members/${ADMIN_A}`, { role: 'reader' }],
  ['DELETE', `/members/${ADMIN_A}`],
];

describe('гейты /api/team', () => {
  it('без сессии -> 401', async () => {
    expect((await call('GET', '')).status).toBe(401);
    expect((await call('GET', '/members')).status).toBe(401);
  });

  it('без команды -> 403', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    expect((await call('GET', '', MEMBER_A)).status).toBe(403);
    expect((await call('GET', '/members', ADMIN_A)).status).toBe(403);
  });

  it('GET / — любому участнику: своя команда', async () => {
    const res = await call('GET', '', MEMBER_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'team-a', name: 'Команда A' });
  });

  it.each(ADMIN_ENDPOINTS)('musician: %s %s -> 403, без записей', async (method, path, body) => {
    const res = await call(method, path, MEMBER_A, body);
    expect(res.status).toBe(403);
    expectNoWrites();
  });

  it('musician_editor не управляет командой -> 403', async () => {
    users[MEMBER_A].role = 'musician_editor';
    expect((await call('GET', '/members', MEMBER_A)).status).toBe(403);
  });
});

describe('GET /api/team/members', () => {
  it('только участники своей команды, без email', async () => {
    users[MEMBER_A].status = 'suspended';
    const res = await call('GET', '/members', ADMIN_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { userId: ADMIN_A, login: 'admin-a', displayName: 'ADMIN-A', role: 'team_admin', active: true },
      { userId: MEMBER_A, login: 'member-a', displayName: 'MEMBER-A', role: 'musician', active: false },
    ]);
  });

  it('админ команды B видит только B', async () => {
    const res = await call('GET', '/members', ADMIN_B);
    const ids = ((await res.json()) as Array<{ userId: string }>).map((m) => m.userId);
    expect(ids).toEqual([ADMIN_B, MEMBER_B]);
  });
});

describe('POST /api/team/invites', () => {
  it('команда — из сессии, роль — из тела; team в теле игнорируется', async () => {
    const res = await call('POST', '/invites', ADMIN_A, { role: 'musician_editor', team: 'team-b' });
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ kind: 'activate', team: 'team-a', role: 'musician_editor', user: null });
    expect(url).toContain(`token=${invites[0].token}`);
  });

  it.each([[{ role: 'admin' }], [{}], [{ role: 42 }], ['not-an-object']])(
    'роль вне AppRole (%j) -> 400, инвайта нет',
    async (body) => {
      expect((await call('POST', '/invites', ADMIN_A, body)).status).toBe(400);
      expect(invites).toEqual([]);
    },
  );
});

describe('POST /api/team/members/:userId/reset', () => {
  it('участник своей команды -> 201, reset-инвайт на него', async () => {
    const res = await call('POST', `/members/${MEMBER_A}/reset`, ADMIN_A);
    expect(res.status).toBe(201);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ kind: 'reset', user: MEMBER_A });
  });

  it.each([MEMBER_B, ADMIN_B, NOBODY])('чужой или несуществующий (%s) -> 404, инвайта нет', async (id) => {
    expect((await call('POST', `/members/${id}/reset`, ADMIN_A)).status).toBe(404);
    expect(invites).toEqual([]);
  });

  it('id не uuid -> 400', async () => {
    expect((await call('POST', '/members/not-a-uuid/reset', ADMIN_A)).status).toBe(400);
  });
});

describe('PATCH /api/team/members/:userId', () => {
  it('участник своей команды -> роль Directus по APP_ROLE_TO_DIRECTUS_ROLE', async () => {
    const res = await call('PATCH', `/members/${MEMBER_A}`, ADMIN_A, { role: 'reader' });
    expect(res.status).toBe(200);
    expect(users[MEMBER_A].role).toBe('Чтец');
  });

  it.each([MEMBER_B, ADMIN_B, NOBODY])('чужой или несуществующий (%s) -> 404, без записей', async (id) => {
    expect((await call('PATCH', `/members/${id}`, ADMIN_A, { role: 'reader' })).status).toBe(404);
    expectNoWrites();
  });

  it.each([ADMIN_A, ADMIN_A.toUpperCase()])('свою роль (%s) -> 409', async (id) => {
    expect((await call('PATCH', `/members/${id}`, ADMIN_A, { role: 'reader' })).status).toBe(409);
    expectNoWrites();
  });

  it('роль вне AppRole -> 400', async () => {
    expect((await call('PATCH', `/members/${MEMBER_A}`, ADMIN_A, { role: 'owner' })).status).toBe(400);
    expectNoWrites();
  });

  it('роли нет в Directus -> 500, роль не сброшена', async () => {
    ROLES.splice(0, 1);
    try {
      expect((await call('PATCH', `/members/${MEMBER_A}`, ADMIN_A, { role: 'reader' })).status).toBe(500);
      expectNoWrites();
    } finally {
      ROLES.unshift({ id: 'role-reader', name: 'Чтец' });
    }
  });
});

describe('DELETE /api/team/members/:userId', () => {
  it('участник своей команды -> членство удалено, аккаунт suspended, но не удалён', async () => {
    const res = await call('DELETE', `/members/${MEMBER_A}`, ADMIN_A);
    expect(res.status).toBe(200);
    expect(memberships.some((m) => m.user === MEMBER_A)).toBe(false);
    expect(users[MEMBER_A]).toMatchObject({ id: MEMBER_A, status: 'suspended' });
  });

  it.each([MEMBER_B, ADMIN_B, NOBODY])('чужой или несуществующий (%s) -> 404, без записей', async (id) => {
    expect((await call('DELETE', `/members/${id}`, ADMIN_A)).status).toBe(404);
    expectNoWrites();
  });

  it.each([ADMIN_A, ADMIN_A.toUpperCase()])('себя (%s) -> 409', async (id) => {
    expect((await call('DELETE', `/members/${id}`, ADMIN_A)).status).toBe(409);
    expectNoWrites();
  });
});
