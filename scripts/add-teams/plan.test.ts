import { describe, expect, it } from 'vitest';
import {
  FIELDS,
  PRIMARY_KEYS,
  RELATIONS,
  STRIP_PERMISSIONS,
  checkHost,
  fieldKey,
  planFinalize,
  planMemberships,
  planSchema,
  planStrip,
  planTeamAdminRole,
  type SchemaState,
} from './plan';

const migratedSchema = (): SchemaState => ({
  collections: new Set(['teams', 'team_members', 'songs', 'setlists', 'auth_invites']),
  fields: new Set([
    ...Object.values(PRIMARY_KEYS).map((f) => fieldKey(f.collection, f.field)),
    ...FIELDS.map((f) => fieldKey(f.collection, f.field)),
  ]),
  relations: new Set(RELATIONS.map((r) => fieldKey(r.collection, r.field))),
});

describe('checkHost', () => {
  it('rejects a confirm-host that differs from the Directus URL host', () => {
    expect(checkHost('https://bible.baptistnn.ru/directus', 'localhost:18055')).toMatchObject({
      ok: false,
      host: 'bible.baptistnn.ru',
    });
  });

  it('requires the port when the URL has one', () => {
    expect(checkHost('http://localhost:18055', 'localhost').ok).toBe(false);
    expect(checkHost('http://localhost:18055', 'localhost:18055')).toEqual({ ok: true, host: 'localhost:18055' });
  });

  it('accepts the exact host case-insensitively', () => {
    expect(checkHost('https://bible.baptistnn.ru/directus', 'Bible.Baptistnn.ru')).toEqual({
      ok: true,
      host: 'bible.baptistnn.ru',
    });
  });

  it('rejects a missing confirm-host, URL or an invalid URL', () => {
    expect(checkHost('https://bible.baptistnn.ru/directus', undefined)).toMatchObject({ ok: false, host: 'bible.baptistnn.ru' });
    expect(checkHost(undefined, 'bible.baptistnn.ru')).toMatchObject({ ok: false, host: null });
    expect(checkHost('not a url', 'not a url')).toMatchObject({ ok: false, host: null });
  });
});

describe('planSchema', () => {
  it('plans nothing when everything already exists', () => {
    expect(planSchema(migratedSchema())).toEqual([]);
  });

  it('creates collections, then fields, then relations on an empty schema', () => {
    const steps = planSchema({
      collections: new Set(['songs', 'setlists', 'auth_invites']),
      fields: new Set(),
      relations: new Set(),
    });
    const kinds = steps.map((s) => s.kind);
    expect(kinds.lastIndexOf('collection')).toBeLessThan(kinds.indexOf('field'));
    expect(kinds.lastIndexOf('field')).toBeLessThan(kinds.indexOf('relation'));
    expect(kinds.filter((k) => k === 'collection')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'field')).toHaveLength(FIELDS.length);
    expect(kinds.filter((k) => k === 'relation')).toHaveLength(RELATIONS.length);
  });

  it('plans only the missing element after an interrupted run', () => {
    const state = migratedSchema();
    const fields = new Set(state.fields);
    fields.delete('setlists.team');
    const relations = new Set(state.relations);
    relations.delete('setlists.team');
    const steps = planSchema({ ...state, fields, relations });
    expect(steps).toEqual([
      expect.objectContaining({ kind: 'field', spec: expect.objectContaining({ collection: 'setlists', field: 'team' }) }),
      expect.objectContaining({ kind: 'relation', spec: expect.objectContaining({ collection: 'setlists', field: 'team' }) }),
    ]);
  });

  it('declares the team constraints of the migration', () => {
    const field = (c: string, f: string) => FIELDS.find((x) => x.collection === c && x.field === f);
    const relation = (c: string, f: string) => RELATIONS.find((x) => x.collection === c && x.field === f);
    expect(field('team_members', 'user')?.schema).toMatchObject({ is_nullable: false, is_unique: true });
    expect(field('teams', 'slug')?.schema).toMatchObject({ is_nullable: false, is_unique: true });
    for (const c of ['songs', 'setlists', 'auth_invites']) {
      expect(field(c, 'team')?.schema).toMatchObject({ is_nullable: true });
    }
    expect(relation('team_members', 'team')?.onDelete).toBe('RESTRICT');
    expect(relation('team_members', 'user')?.onDelete).toBe('CASCADE');
    expect(relation('songs', 'team')?.onDelete).toBe('RESTRICT');
    expect(relation('songs', 'origin_song')).toMatchObject({ related: 'songs', onDelete: 'SET NULL' });
    expect(relation('setlists', 'team')?.onDelete).toBe('RESTRICT');
    expect(relation('auth_invites', 'team')?.onDelete).toBe('CASCADE');
  });

  it('declares auth_invites.role as a nullable string with the app roles as choices', () => {
    const role = FIELDS.find((f) => f.collection === 'auth_invites' && f.field === 'role');
    expect(role).toMatchObject({ type: 'string', schema: { is_nullable: true } });
    expect(role?.schema).not.toHaveProperty('default_value');
    const choices = (role?.meta.options as { choices: { value: string }[] }).choices.map((c) => c.value);
    expect(choices).toEqual(['reader', 'musician', 'musician_editor', 'team_admin']);
  });

  it('plans auth_invites.role when only it is missing', () => {
    const state = migratedSchema();
    const fields = new Set(state.fields);
    fields.delete('auth_invites.role');
    expect(planSchema({ ...state, fields })).toEqual([
      expect.objectContaining({ kind: 'field', spec: expect.objectContaining({ collection: 'auth_invites', field: 'role' }) }),
    ]);
  });
});

describe('planTeamAdminRole', () => {
  const custom = { id: 'p-custom', name: 'custom' };
  const editor = { id: 'p-editor', name: 'setlist_editor' };
  const template = { id: 'r-editor', name: 'musician_editor', policies: [custom, editor] };

  it('creates the role with the policies of musician_editor', () => {
    expect(planTeamAdminRole([template, { id: 'r-reader', name: 'Чтец', policies: [custom] }])).toEqual({
      roleId: null,
      addPolicies: [custom, editor],
      templateMissing: false,
    });
  });

  it('plans nothing when team_admin already has the same policies', () => {
    expect(planTeamAdminRole([template, { id: 'r-admin', name: 'team_admin', policies: [editor, custom] }])).toEqual({
      roleId: 'r-admin',
      addPolicies: [],
      templateMissing: false,
    });
  });

  it('links only the policies team_admin is missing', () => {
    const plan = planTeamAdminRole([template, { id: 'r-admin', name: 'team_admin', policies: [custom] }]);
    expect(plan.addPolicies).toEqual([editor]);
  });

  it('creates the role without policies when musician_editor is missing', () => {
    expect(planTeamAdminRole([{ id: 'r-reader', name: 'Чтец', policies: [custom] }])).toEqual({
      roleId: null,
      addPolicies: [],
      templateMissing: true,
    });
  });
});

describe('planMemberships', () => {
  const roles = [
    { id: 'r-reader', name: 'Чтец' },
    { id: 'r-musician', name: 'musician' },
    { id: 'r-editor', name: 'musician_editor' },
    { id: 'r-admin', name: 'Administrator' },
    { id: 'r-mcp', name: 'mcp_agent' },
  ];

  it('adds only app roles without a membership; other roles and users without a role are skipped', () => {
    const plan = planMemberships({
      roles,
      users: [
        { id: 'u-reader', role: 'r-reader' },
        { id: 'u-musician', role: 'r-musician' },
        { id: 'u-editor', role: 'r-editor' },
        { id: 'u-admin', role: 'r-admin' },
        { id: 'u-mcp', role: 'r-mcp' },
        { id: 'u-norole', role: null },
        { id: 'u-member', role: 'r-reader' },
      ],
      memberUserIds: new Set(['u-member']),
    });
    expect(plan).toEqual({
      toAdd: ['u-reader', 'u-musician', 'u-editor'],
      alreadyMembers: 1,
      otherRole: 2,
      noRole: 1,
    });
  });

  it('adds nobody when every app user is already a member', () => {
    const plan = planMemberships({
      roles,
      users: [{ id: 'u1', role: 'r-reader' }],
      memberUserIds: new Set(['u1']),
    });
    expect(plan.toAdd).toEqual([]);
  });
});

describe('planFinalize', () => {
  it('refuses while rows without a team remain', () => {
    const plan = planFinalize({
      songs: { nullable: true, nullCount: 3 },
      setlists: { nullable: true, nullCount: 0 },
    });
    expect(plan).toEqual({ ok: false, reason: expect.stringContaining('songs: 3') });
  });

  it('refuses when apply has not created the field', () => {
    const plan = planFinalize({
      songs: { nullable: undefined, nullCount: 0 },
      setlists: { nullable: true, nullCount: 0 },
    });
    expect(plan.ok).toBe(false);
  });

  it('requires team in both collections once every row has one', () => {
    expect(
      planFinalize({ songs: { nullable: true, nullCount: 0 }, setlists: { nullable: true, nullCount: 0 } }),
    ).toEqual({ ok: true, toRequire: ['songs', 'setlists'] });
  });

  it('plans nothing when team is already NOT NULL', () => {
    expect(
      planFinalize({ songs: { nullable: false, nullCount: 0 }, setlists: { nullable: false, nullCount: 0 } }),
    ).toEqual({ ok: true, toRequire: [] });
  });
});

describe('planStrip', () => {
  it('lists exactly the permissions of the strip list', () => {
    expect(STRIP_PERMISSIONS).toEqual([
      { policy: 'custom', collection: 'setlists', actions: ['read'] },
      { policy: 'custom', collection: 'setlist_items', actions: ['read'] },
      { policy: 'custom', collection: 'reading', actions: ['read', 'update', 'delete'] },
      { policy: 'custom', collection: 'telegram_user_mapping', actions: ['read'] },
      { policy: 'setlist_editor', collection: 'setlists', actions: 'all' },
      { policy: 'setlist_editor', collection: 'setlist_items', actions: 'all' },
    ]);
  });

  it('selects matching rows and keeps everything else', () => {
    const policies = [
      { id: 'p-custom', name: 'custom' },
      { id: 'p-editor', name: 'setlist_editor' },
      { id: 'p-other', name: 'mcp_agent' },
    ];
    const rows = [
      { id: 1, policy: 'p-custom', collection: 'setlists', action: 'read' },
      { id: 2, policy: 'p-custom', collection: 'setlist_items', action: 'read' },
      { id: 3, policy: 'p-custom', collection: 'reading', action: 'read' },
      { id: 4, policy: 'p-custom', collection: 'reading', action: 'update' },
      { id: 5, policy: 'p-custom', collection: 'reading', action: 'delete' },
      { id: 6, policy: 'p-custom', collection: 'telegram_user_mapping', action: 'read' },
      { id: 7, policy: 'p-custom', collection: 'song_user_state', action: 'read' },
      { id: 8, policy: 'p-custom', collection: 'reading', action: 'create' },
      { id: 9, policy: 'p-custom', collection: 'setlists', action: 'update' },
      { id: 10, policy: 'p-editor', collection: 'setlists', action: 'create' },
      { id: 11, policy: 'p-editor', collection: 'setlist_items', action: 'delete' },
      { id: 12, policy: 'p-editor', collection: 'songs', action: 'read' },
      { id: 13, policy: 'p-other', collection: 'setlists', action: 'read' },
      { id: 14, policy: 'p-unknown', collection: 'setlists', action: 'read' },
    ];
    expect(planStrip(policies, rows).map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6, 10, 11]);
  });

  it('finds nothing to delete after a previous run', () => {
    const rows = [{ id: 7, policy: 'p-custom', collection: 'song_user_state', action: 'read' }];
    expect(planStrip([{ id: 'p-custom', name: 'custom' }], rows)).toEqual([]);
  });
});
