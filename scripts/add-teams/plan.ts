/**
 * Чистая логика миграции команд (`scripts/add-teams.ts`): что должно существовать в Directus
 * и что сделать при данном состоянии. Без сети — состояние приходит аргументами,
 * ввод-вывод живёт в `run.ts`.
 */

/**
 * Строки `directus_permissions`, которые снимает `strip-user-permissions`: эти коллекции
 * приложение читает и пишет только admin-клиентом в BFF. `actions: 'all'` — все строки
 * политики по коллекции. `song_user_state` (фильтр по владельцу) остаётся.
 */
export const STRIP_PERMISSIONS: readonly StripRule[] = [
  { policy: 'custom', collection: 'setlists', actions: ['read'] },
  { policy: 'custom', collection: 'setlist_items', actions: ['read'] },
  { policy: 'custom', collection: 'reading', actions: ['read', 'update', 'delete'] },
  { policy: 'custom', collection: 'telegram_user_mapping', actions: ['read'] },
  { policy: 'setlist_editor', collection: 'setlists', actions: 'all' },
  { policy: 'setlist_editor', collection: 'setlist_items', actions: 'all' },
];

export const NBC_TEAM = { slug: 'nbc', name: 'НБЦ' } as const;

/** Роли пользователей приложения NBC — они получают членство в команде NBC. */
export const MEMBER_ROLE_NAMES: readonly string[] = ['Чтец', 'musician', 'musician_editor'];

/** Роль Directus администратора команды; политики копируются с {@link TEAM_ADMIN_TEMPLATE_ROLE}. */
export const TEAM_ADMIN_ROLE = 'team_admin';
export const TEAM_ADMIN_TEMPLATE_ROLE = 'musician_editor';

/** Значения `auth_invites.role` — `AppRole` приложения; в роль Directus их переводит BFF. */
export const INVITE_ROLE_CHOICES: readonly { value: string; text: string }[] = [
  { value: 'reader', text: 'Чтец' },
  { value: 'musician', text: 'Музыкант' },
  { value: 'musician_editor', text: 'Музыкант-редактор' },
  { value: 'team_admin', text: 'Администратор команды' },
];

/** Коллекции, строкам которых `apply` проставляет команду NBC. */
export const BACKFILL_COLLECTIONS = ['songs', 'setlists', 'auth_invites'] as const;
export type BackfillCollection = (typeof BACKFILL_COLLECTIONS)[number];

/** `finalize` делает `team` обязательным только здесь: у reset-инвайтов команды нет. */
export const REQUIRED_TEAM_COLLECTIONS = ['songs', 'setlists'] as const;
export type RequiredTeamCollection = (typeof REQUIRED_TEAM_COLLECTIONS)[number];

export interface StripRule {
  policy: string;
  collection: string;
  actions: readonly string[] | 'all';
}

export interface CollectionSpec {
  collection: string;
  meta: Record<string, unknown>;
}

export interface FieldSpec {
  collection: string;
  field: string;
  type: string;
  meta: Record<string, unknown>;
  schema: Record<string, unknown>;
}

export interface RelationSpec {
  collection: string;
  field: string;
  related: string;
  onDelete: 'RESTRICT' | 'CASCADE' | 'SET NULL';
}

const uuidPk = (collection: string): FieldSpec => ({
  collection,
  field: 'id',
  type: 'uuid',
  meta: { special: ['uuid'], interface: 'input', readonly: true, hidden: true },
  schema: { is_primary_key: true, has_auto_increment: false, is_nullable: false },
});

const dateCreated = (collection: string): FieldSpec => ({
  collection,
  field: 'date_created',
  type: 'timestamp',
  meta: {
    special: ['date-created'],
    interface: 'datetime',
    display: 'datetime',
    display_options: { relative: true },
    readonly: true,
    hidden: true,
    width: 'half',
  },
  schema: {},
});

const m2o = (
  collection: string,
  field: string,
  type: 'uuid' | 'integer',
  template: string,
  note: string,
  schema: Record<string, unknown>,
): FieldSpec => ({
  collection,
  field,
  type,
  meta: {
    special: ['m2o'],
    interface: 'select-dropdown-m2o',
    options: { template },
    display: 'related-values',
    display_options: { template },
    required: schema.is_nullable === false,
    note,
    width: 'half',
  },
  schema,
});

export const COLLECTIONS: readonly CollectionSpec[] = [
  {
    collection: 'teams',
    meta: { icon: 'groups', note: 'Команды: песни и сеты разделены по команде', display_template: '{{name}}' },
  },
  {
    collection: 'team_members',
    meta: { icon: 'group_add', note: 'Участники команд: один пользователь — одна команда', display_template: '{{user.email}}' },
  },
];

/** PK коллекций создаётся вместе с коллекцией — здесь только остальные поля. */
export const PRIMARY_KEYS: Readonly<Record<string, FieldSpec>> = {
  teams: uuidPk('teams'),
  team_members: uuidPk('team_members'),
};

export const FIELDS: readonly FieldSpec[] = [
  {
    collection: 'teams',
    field: 'name',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'Название команды', width: 'half' },
    schema: { is_nullable: false },
  },
  {
    collection: 'teams',
    field: 'slug',
    type: 'string',
    meta: { interface: 'input', required: true, note: 'Короткий латинский идентификатор', width: 'half' },
    schema: { is_nullable: false, is_unique: true },
  },
  dateCreated('teams'),
  m2o('team_members', 'team', 'uuid', '{{name}}', 'Команда', { is_nullable: false }),
  m2o('team_members', 'user', 'uuid', '{{email}}', 'Пользователь (одна команда на пользователя)', {
    is_nullable: false,
    is_unique: true,
  }),
  dateCreated('team_members'),
  m2o('songs', 'team', 'uuid', '{{name}}', 'Команда-владелец песни', { is_nullable: true }),
  m2o('songs', 'origin_song', 'integer', '{{title}}', 'Оригинал, если песня скопирована из каталога', {
    is_nullable: true,
  }),
  m2o('setlists', 'team', 'uuid', '{{name}}', 'Команда-владелец сета', { is_nullable: true }),
  m2o('auth_invites', 'team', 'uuid', '{{name}}', 'Команда, в которую приглашает инвайт', { is_nullable: true }),
  {
    collection: 'auth_invites',
    field: 'role',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      options: { choices: INVITE_ROLE_CHOICES },
      note: 'Роль в приложении для приглашённого; у reset-инвайтов пусто',
      width: 'half',
    },
    schema: { is_nullable: true },
  },
];

export const RELATIONS: readonly RelationSpec[] = [
  { collection: 'team_members', field: 'team', related: 'teams', onDelete: 'RESTRICT' },
  { collection: 'team_members', field: 'user', related: 'directus_users', onDelete: 'CASCADE' },
  { collection: 'songs', field: 'team', related: 'teams', onDelete: 'RESTRICT' },
  { collection: 'songs', field: 'origin_song', related: 'songs', onDelete: 'SET NULL' },
  { collection: 'setlists', field: 'team', related: 'teams', onDelete: 'RESTRICT' },
  { collection: 'auth_invites', field: 'team', related: 'teams', onDelete: 'CASCADE' },
];

export type SchemaStep =
  | { kind: 'collection'; spec: CollectionSpec; primaryKey: FieldSpec }
  | { kind: 'field'; spec: FieldSpec }
  | { kind: 'relation'; spec: RelationSpec };

export interface SchemaState {
  collections: ReadonlySet<string>;
  /** `collection.field` */
  fields: ReadonlySet<string>;
  /** `collection.field` полей, у которых уже есть relation */
  relations: ReadonlySet<string>;
}

export const fieldKey = (collection: string, field: string): string => `${collection}.${field}`;

/**
 * Недостающие элементы схемы в порядке создания: коллекции → поля → связи. Каждый элемент
 * проверяется отдельно, поэтому прерванный прогон дозавершается повторным запуском.
 */
export function planSchema(state: SchemaState): SchemaStep[] {
  const steps: SchemaStep[] = [];
  for (const spec of COLLECTIONS) {
    if (!state.collections.has(spec.collection)) {
      steps.push({ kind: 'collection', spec, primaryKey: PRIMARY_KEYS[spec.collection] });
    }
  }
  for (const spec of FIELDS) {
    if (!state.fields.has(fieldKey(spec.collection, spec.field))) steps.push({ kind: 'field', spec });
  }
  for (const spec of RELATIONS) {
    if (!state.relations.has(fieldKey(spec.collection, spec.field))) steps.push({ kind: 'relation', spec });
  }
  return steps;
}

export function describeSchemaStep(step: SchemaStep): string {
  switch (step.kind) {
    case 'collection':
      return `create collection "${step.spec.collection}"`;
    case 'field':
      return `create field "${fieldKey(step.spec.collection, step.spec.field)}" (${step.spec.type})`;
    case 'relation':
      return `create relation "${fieldKey(step.spec.collection, step.spec.field)}" -> "${step.spec.related}" (on delete ${step.spec.onDelete})`;
  }
}

export interface MembershipInput {
  roles: readonly { id: string; name: string }[];
  users: readonly { id: string; role: string | null }[];
  /** Пользователи, у которых уже есть строка в `team_members` (любой команды). */
  memberUserIds: ReadonlySet<string>;
}

export interface MembershipPlan {
  toAdd: string[];
  alreadyMembers: number;
  otherRole: number;
  noRole: number;
}

/** Членство в NBC получают только пользователи ролей {@link MEMBER_ROLE_NAMES} без членства. */
export function planMemberships({ roles, users, memberUserIds }: MembershipInput): MembershipPlan {
  const memberRoleIds = new Set(roles.filter((r) => MEMBER_ROLE_NAMES.includes(r.name)).map((r) => r.id));
  const plan: MembershipPlan = { toAdd: [], alreadyMembers: 0, otherRole: 0, noRole: 0 };
  for (const user of users) {
    if (!user.role) plan.noRole += 1;
    else if (!memberRoleIds.has(user.role)) plan.otherRole += 1;
    else if (memberUserIds.has(user.id)) plan.alreadyMembers += 1;
    else plan.toAdd.push(user.id);
  }
  return plan;
}

export interface RoleWithPolicies {
  id: string;
  name: string;
  policies: readonly { id: string; name: string }[];
}

export interface TeamAdminRolePlan {
  /** `null` — роли `team_admin` ещё нет, её надо создать. */
  roleId: string | null;
  /** Политики шаблонной роли, которых у `team_admin` пока нет. Лишние связи не снимаются. */
  addPolicies: { id: string; name: string }[];
  templateMissing: boolean;
}

/** `team_admin` получает те же политики, что `musician_editor` на этом инстансе (по связям access). */
export function planTeamAdminRole(roles: readonly RoleWithPolicies[]): TeamAdminRolePlan {
  const template = roles.find((r) => r.name === TEAM_ADMIN_TEMPLATE_ROLE);
  const role = roles.find((r) => r.name === TEAM_ADMIN_ROLE);
  const linked = new Set(role?.policies.map((p) => p.id) ?? []);
  return {
    roleId: role?.id ?? null,
    addPolicies: (template?.policies ?? []).filter((p) => !linked.has(p.id)),
    templateMissing: !template,
  };
}

export interface TeamFieldState {
  /** `undefined` — поля `team` нет (apply не запускался). */
  nullable: boolean | undefined;
  nullCount: number;
}

export type FinalizePlan =
  | { ok: true; toRequire: RequiredTeamCollection[] }
  | { ok: false; reason: string };

/** NOT NULL ставится, только если ни в одной коллекции не осталось строк без команды. */
export function planFinalize(state: Record<RequiredTeamCollection, TeamFieldState>): FinalizePlan {
  const missing = REQUIRED_TEAM_COLLECTIONS.filter((c) => state[c].nullable === undefined);
  if (missing.length) {
    return { ok: false, reason: `field "team" is missing in ${missing.join(', ')} — run apply first` };
  }
  const withNulls = REQUIRED_TEAM_COLLECTIONS.filter((c) => state[c].nullCount > 0);
  if (withNulls.length) {
    const counts = withNulls.map((c) => `${c}: ${state[c].nullCount}`).join(', ');
    return { ok: false, reason: `rows without team (${counts}) — run apply first` };
  }
  return { ok: true, toRequire: REQUIRED_TEAM_COLLECTIONS.filter((c) => state[c].nullable === true) };
}

export interface PermissionRow {
  id: number;
  policy: string;
  collection: string;
  action: string;
}

export interface StripMatch extends PermissionRow {
  policyName: string;
}

/** Строки прав из {@link STRIP_PERMISSIONS}; политики ищутся по имени (имя в Directus не уникально). */
export function planStrip(
  policies: readonly { id: string; name: string }[],
  permissions: readonly PermissionRow[],
  rules: readonly StripRule[] = STRIP_PERMISSIONS,
): StripMatch[] {
  const policyNames = new Map(policies.map((p) => [p.id, p.name]));
  const matches: StripMatch[] = [];
  for (const row of permissions) {
    const policyName = policyNames.get(row.policy);
    if (policyName === undefined) continue;
    const hit = rules.some(
      (r) =>
        r.policy === policyName &&
        r.collection === row.collection &&
        (r.actions === 'all' || r.actions.includes(row.action)),
    );
    if (hit) matches.push({ ...row, policyName });
  }
  return matches;
}

export type HostCheck = { ok: true; host: string } | { ok: false; host: string | null; reason: string };

/** Хост цели берётся из URL Directus; `--confirm-host` обязан совпасть с ним точно (с портом). */
export function checkHost(directusUrl: string | undefined, confirmHost: string | undefined): HostCheck {
  if (!directusUrl) return { ok: false, host: null, reason: 'NEXT_PUBLIC_DIRECTUS_URL is not set' };
  let host: string;
  try {
    host = new URL(directusUrl).host.toLowerCase();
  } catch {
    return { ok: false, host: null, reason: `NEXT_PUBLIC_DIRECTUS_URL is not a valid URL` };
  }
  if (!confirmHost) return { ok: false, host, reason: '--confirm-host is required' };
  if (confirmHost.trim().toLowerCase() !== host) {
    return { ok: false, host, reason: `--confirm-host=${confirmHost} does not match the target host` };
  }
  return { ok: true, host };
}
