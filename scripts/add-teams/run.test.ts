import { describe, expect, it, vi } from 'vitest';
import { FIELDS, PRIMARY_KEYS, RELATIONS } from './plan';
import { run, type Logger, type MigrationClient } from './run';

interface Req {
  path: string;
  method?: string;
  params?: Record<string, unknown>;
  body?: string;
}

function fakeClient(handle: (req: Req) => unknown) {
  const calls: Req[] = [];
  const client = {
    request: vi.fn(async (command: unknown) => {
      const req = (command as () => Req)();
      calls.push(req);
      return handle(req);
    }),
  } as unknown as MigrationClient;
  return { client, calls };
}

function memoryLog() {
  const lines: string[] = [];
  const log: Logger = { info: (m) => lines.push(m), error: (m) => lines.push(m) };
  return { log, lines };
}

const LOCAL = 'http://localhost:18055';
const roles = [
  { id: 'r-reader', name: 'Чтец' },
  { id: 'r-admin', name: 'Administrator' },
];

/** Directus, в котором `apply` уже отработал полностью. */
function migratedDirectus(req: Req): unknown {
  if (req.method !== 'GET') throw new Error(`unexpected ${req.method} ${req.path}`);
  switch (req.path) {
    case '/collections':
      return ['teams', 'team_members', 'songs', 'setlists', 'auth_invites'].map((collection) => ({ collection }));
    case '/fields':
      return [...Object.values(PRIMARY_KEYS), ...FIELDS].map((f) => ({
        collection: f.collection,
        field: f.field,
        schema: { is_nullable: true },
      }));
    case '/relations':
      return RELATIONS.map((r) => ({ collection: r.collection, field: r.field, related_collection: r.related }));
    case '/items/teams':
      return [{ id: 'team-nbc' }];
    case '/items/songs':
    case '/items/setlists':
    case '/items/auth_invites':
      return [];
    case '/roles':
      return roles;
    case '/users':
      return [
        { id: 'u-reader', role: 'r-reader' },
        { id: 'u-admin', role: 'r-admin' },
        { id: 'u-norole', role: null },
      ];
    case '/items/team_members':
      return [{ user: 'u-reader' }];
    default:
      throw new Error(`unexpected GET ${req.path}`);
  }
}

describe('run: host guard', () => {
  it('exits with 1 and makes no requests when confirm-host does not match', async () => {
    const request = vi.fn();
    const createClient = vi.fn(() => ({ request }) as unknown as MigrationClient);
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055'], {
      directusUrl: 'https://bible.baptistnn.ru/directus',
      createClient,
      log,
    });

    expect(code).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('target host: bible.baptistnn.ru');
  });

  it('exits with 1 without a client when confirm-host or the URL is missing', async () => {
    const createClient = vi.fn();
    const { log } = memoryLog();
    expect(await run(['finalize'], { directusUrl: LOCAL, createClient, log })).toBe(1);
    expect(
      await run(['strip-user-permissions', '--confirm-host=localhost:18055'], { directusUrl: undefined, createClient, log }),
    ).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('exits with 1 on an unknown command', async () => {
    const createClient = vi.fn();
    const { log } = memoryLog();
    expect(await run(['drop', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient, log })).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('run: apply', () => {
  it('changes nothing when the migration is already applied', async () => {
    const { client, calls } = fakeClient(migratedDirectus);
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    expect(code).toBe(0);
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(lines.join('\n')).toContain('schema: up to date');
    expect(lines.join('\n')).toContain('0 user(s) added');
  });

  it('dry run only reads, even when everything is missing', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.method !== 'GET') throw new Error(`unexpected ${req.method} ${req.path}`);
      if (req.path === '/collections') return [{ collection: 'songs' }, { collection: 'setlists' }, { collection: 'auth_invites' }];
      if (req.path === '/fields' || req.path === '/relations') return [];
      if (req.path.startsWith('/items/')) return [{ count: 5 }];
      if (req.path === '/roles') return roles;
      if (req.path === '/users') return [{ id: 'u-reader', role: 'r-reader' }];
      throw new Error(`unexpected GET ${req.path}`);
    });
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055', '--dry-run'], {
      directusUrl: LOCAL,
      createClient: () => client,
      log,
    });

    expect(code).toBe(0);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    // Поля team ещё нет — считаются все строки, без фильтра по несуществующему полю.
    expect(calls.filter((c) => c.path === '/items/songs').map((c) => c.params?.filter)).toEqual([undefined]);
    expect(lines.join('\n')).toContain('would set team="nbc" on 5 row(s) of "songs"');
    expect(lines.join('\n')).toContain('would add 1 user(s)');
  });
});

describe('run: finalize', () => {
  it('refuses with 1 and changes nothing while songs without a team remain', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.path === '/fields') {
        return [
          { collection: 'songs', field: 'team', schema: { is_nullable: true } },
          { collection: 'setlists', field: 'team', schema: { is_nullable: true } },
        ];
      }
      if (req.path === '/items/songs') return [{ count: '2' }];
      if (req.path === '/items/setlists') return [{ count: '0' }];
      throw new Error(`unexpected ${req.method} ${req.path}`);
    });
    const { log, lines } = memoryLog();

    const code = await run(['finalize', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    expect(code).toBe(1);
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    expect(lines.join('\n')).toContain('songs: 2');
  });
});

describe('run: strip-user-permissions', () => {
  it('deletes exactly the listed rows of the user policies', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.path === '/policies') return [{ id: 'p-custom', name: 'custom' }, { id: 'p-editor', name: 'setlist_editor' }];
      if (req.path === '/permissions' && req.method === 'GET') {
        return [
          { id: 1, policy: 'p-custom', collection: 'setlists', action: 'read' },
          { id: 2, policy: 'p-custom', collection: 'song_user_state', action: 'read' },
          { id: 3, policy: 'p-editor', collection: 'setlist_items', action: 'update' },
        ];
      }
      if (req.path === '/permissions' && req.method === 'DELETE') return undefined;
      throw new Error(`unexpected ${req.method} ${req.path}`);
    });
    const { log } = memoryLog();

    const code = await run(['strip-user-permissions', '--confirm-host=localhost:18055'], {
      directusUrl: LOCAL,
      createClient: () => client,
      log,
    });

    expect(code).toBe(0);
    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(String(deletes[0].body))).toEqual([1, 3]);
  });
});
