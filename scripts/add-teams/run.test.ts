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
  const log: Logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) };
  return { log, lines };
}

const LOCAL = 'http://localhost:18055';
const roles = [
  { id: 'r-reader', name: 'Чтец' },
  { id: 'r-editor', name: 'musician_editor' },
  { id: 'r-team-admin', name: 'team_admin' },
  { id: 'r-admin', name: 'Administrator' },
];
const customPolicy = { id: 'p-custom', name: 'custom' };
const editorPolicy = { id: 'p-setlist-editor', name: 'setlist_editor' };
const access = [
  { role: 'r-reader', policy: customPolicy },
  { role: 'r-editor', policy: customPolicy },
  { role: 'r-editor', policy: editorPolicy },
  { role: 'r-team-admin', policy: customPolicy },
  { role: 'r-team-admin', policy: editorPolicy },
  { role: null, policy: { id: 'p-user-level', name: 'personal' } },
];

const teams = [{ id: 'team-nbc', slug: 'nbc' }];

/** Directus, в котором `apply` уже отработал полностью. */
function migratedDirectus(req: Req): unknown {
  if (req.method !== 'GET') throw new Error(`unexpected ${req.method} ${req.path}`);
  switch (req.path) {
    case '/access':
      return access;
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
      return teams;
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
    expect(lines.join('\n')).toContain('role "team_admin" exists (r-team-admin), policies up to date');
    expect(lines.join('\n')).toContain('0 user(s) added');
  });

  it('creates team_admin with the policies linked to musician_editor', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.method === 'POST' && req.path === '/roles') return { id: 'r-new-admin' };
      if (req.method === 'POST' && req.path === '/access') return [];
      if (req.path === '/roles') return roles.filter((r) => r.name !== 'team_admin');
      if (req.path === '/access') return access.filter((a) => a.role !== 'r-team-admin');
      return migratedDirectus(req);
    });
    const { log } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    expect(code).toBe(0);
    const writes = calls.filter((c) => c.method !== 'GET');
    expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /roles', 'POST /access']);
    expect(JSON.parse(String(writes[0].body))).toMatchObject({ name: 'team_admin' });
    expect(JSON.parse(String(writes[1].body))).toEqual([
      { role: 'r-new-admin', policy: 'p-custom' },
      { role: 'r-new-admin', policy: 'p-setlist-editor' },
    ]);
  });

  it('warns and creates team_admin without policies when musician_editor is missing', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.method === 'POST' && req.path === '/roles') return { id: 'r-new-admin' };
      if (req.path === '/roles') return roles.filter((r) => r.name !== 'team_admin' && r.name !== 'musician_editor');
      if (req.path === '/access') return access.filter((a) => a.role === 'r-reader');
      return migratedDirectus(req);
    });
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    expect(code).toBe(0);
    expect(calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.path}`)).toEqual(['POST /roles']);
    expect(lines.join('\n')).toContain('role "musician_editor" not found');
  });

  it('dry run only reads, even when everything is missing', async () => {
    const { client, calls } = fakeClient((req) => {
      if (req.method !== 'GET') throw new Error(`unexpected ${req.method} ${req.path}`);
      if (req.path === '/collections') return [{ collection: 'songs' }, { collection: 'setlists' }, { collection: 'auth_invites' }];
      if (req.path === '/fields' || req.path === '/relations') return [];
      if (req.path.startsWith('/items/')) return [{ count: 5 }];
      if (req.path === '/roles') return roles.filter((r) => r.name !== 'team_admin');
      if (req.path === '/access') return access.filter((a) => a.role !== 'r-team-admin');
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
    expect(lines.join('\n')).toContain('would create field "auth_invites.role" (string)');
    expect(lines.join('\n')).toContain('would create role "team_admin"');
    expect(lines.join('\n')).toContain('would link policies to "team_admin": custom, setlist_editor');
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

  it('prints every deleted row in full before deleting it', async () => {
    const { log, lines } = memoryLog();
    let linesAtDelete = -1;
    const { client } = fakeClient((req) => {
      if (req.path === '/policies') return [{ id: 'p-custom', name: 'custom' }];
      if (req.path === '/permissions' && req.method === 'GET') {
        expect(req.params?.fields).toEqual(
          expect.arrayContaining(['permissions', 'validation', 'presets', 'fields']),
        );
        return [
          {
            id: 4,
            policy: 'p-custom',
            collection: 'reading',
            action: 'update',
            permissions: { directus_user_id: { _eq: '$CURRENT_USER' } },
            validation: null,
            presets: null,
            fields: ['count'],
          },
        ];
      }
      if (req.path === '/permissions' && req.method === 'DELETE') {
        linesAtDelete = lines.length;
        return undefined;
      }
      throw new Error(`unexpected ${req.method} ${req.path}`);
    });

    await run(['strip-user-permissions', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    const backupIndex = lines.findIndex((l) => l.includes('backup {'));
    expect(backupIndex).toBeGreaterThanOrEqual(0);
    expect(backupIndex).toBeLessThan(linesAtDelete);
    expect(lines.slice(0, backupIndex).join('\n')).toContain('save this output to restore them');
    expect(JSON.parse(lines[backupIndex].slice(lines[backupIndex].indexOf('{')))).toEqual({
      id: 4,
      policy: 'p-custom',
      policy_name: 'custom',
      collection: 'reading',
      action: 'update',
      permissions: { directus_user_id: { _eq: '$CURRENT_USER' } },
      validation: null,
      presets: null,
      fields: ['count'],
    });
  });
});

describe('run: apply with more than one team', () => {
  const otherTeams = [...teams, { id: 'team-x', slug: 'church-x' }];
  /** Пока команд несколько, к строкам данных и пользователям apply ходить не должен. */
  const withOtherTeam = (req: Req): unknown => {
    if (req.path === '/items/teams') return otherTeams;
    if (/^\/items\/(songs|setlists|auth_invites|team_members)$/.test(req.path) || req.path === '/users') {
      throw new Error(`phase-1 request ${req.method} ${req.path}`);
    }
    return migratedDirectus(req);
  };

  it('skips backfill and nbc memberships, keeps schema and roles in place', async () => {
    const { client, calls } = fakeClient(withOtherTeam);
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    expect(code).toBe(0);
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
    const out = lines.join('\n');
    expect(out).toContain('2 teams exist — phase-1 steps skipped');
    expect(out).toContain('schema: up to date');
    expect(out).toContain('role "team_admin" exists');
    expect(out).not.toMatch(/backfill "|memberships:/);
  });

  it('dry run reports the skip as well', async () => {
    const { client } = fakeClient(withOtherTeam);
    const { log, lines } = memoryLog();

    const code = await run(['apply', '--confirm-host=localhost:18055', '--dry-run'], {
      directusUrl: LOCAL,
      createClient: () => client,
      log,
    });

    expect(code).toBe(0);
    expect(lines.join('\n')).toContain('2 teams exist — phase-1 steps skipped');
    expect(lines.join('\n')).not.toContain('would set team=');
  });
});

describe('run: apply backfill', () => {
  it('never assigns a team to reset invites', async () => {
    const { client, calls } = fakeClient(migratedDirectus);
    const { log } = memoryLog();

    await run(['apply', '--confirm-host=localhost:18055'], { directusUrl: LOCAL, createClient: () => client, log });

    const inviteReads = calls.filter((c) => c.path === '/items/auth_invites');
    expect(inviteReads.length).toBeGreaterThan(0);
    for (const read of inviteReads) {
      expect(read.params?.filter).toEqual({ team: { _null: true }, kind: { _neq: 'reset' } });
    }
  });
});
