/**
 * Ввод-вывод миграции команд: разбор аргументов, проверка хоста, чтение состояния Directus
 * и выполнение плана из `plan.ts`. Клиент передаётся снаружи — тесты подставляют мок.
 */
import {
  aggregate,
  createCollection,
  createField,
  createItem,
  createItems,
  createRelation,
  deletePermissions,
  readCollections,
  readFields,
  readItems,
  readPermissions,
  readPolicies,
  readRelations,
  readRoles,
  readUsers,
  updateField,
  updateItems,
  type RestCommand,
} from '@directus/sdk';
import {
  BACKFILL_COLLECTIONS,
  NBC_TEAM,
  REQUIRED_TEAM_COLLECTIONS,
  STRIP_PERMISSIONS,
  checkHost,
  describeSchemaStep,
  fieldKey,
  planFinalize,
  planMemberships,
  planSchema,
  planStrip,
  type BackfillCollection,
  type PermissionRow,
  type RequiredTeamCollection,
  type SchemaState,
  type SchemaStep,
  type TeamFieldState,
} from './plan';

export interface MigrationSchema {
  teams: { id: string; name: string; slug: string; date_created: string | null }[];
  team_members: { id: string; team: string; user: string; date_created: string | null }[];
  songs: { id: number; team: string | null }[];
  setlists: { id: string; team: string | null }[];
  auth_invites: { id: number; team: string | null }[];
}

export interface MigrationClient {
  request<Output>(command: RestCommand<Output, MigrationSchema>): Promise<Output>;
}

export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

export interface RunDeps {
  /** `NEXT_PUBLIC_DIRECTUS_URL` — по нему же ходит admin-клиент. */
  directusUrl: string | undefined;
  /** Вызывается только после проверки хоста. */
  createClient: () => MigrationClient;
  log: Logger;
}

export const LOG = '[add-teams]';
const PAGE = 100;
const COMMANDS = ['apply', 'finalize', 'strip-user-permissions'] as const;
type Command = (typeof COMMANDS)[number];

export const USAGE =
  'usage: npx tsx scripts/add-teams.ts <apply|finalize|strip-user-permissions> --confirm-host=<host> [--dry-run]';

type ParsedArgs =
  | { ok: true; command: Command; confirmHost: string | undefined; dryRun: boolean }
  | { ok: false; reason: string };

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let command: Command | undefined;
  let confirmHost: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--confirm-host=')) confirmHost = arg.slice('--confirm-host='.length);
    else if (!command && (COMMANDS as readonly string[]).includes(arg)) command = arg as Command;
    else return { ok: false, reason: `unknown argument "${arg}"` };
  }
  if (!command) return { ok: false, reason: 'command is required' };
  return { ok: true, command, confirmHost, dryRun };
}

export async function run(argv: readonly string[], deps: RunDeps): Promise<number> {
  const { log } = deps;
  const args = parseArgs(argv);
  if (!args.ok) {
    log.error(`${LOG} ${args.reason}`);
    log.error(USAGE);
    return 1;
  }
  const host = checkHost(deps.directusUrl, args.confirmHost);
  if (!host.ok) {
    log.error(`${LOG} target host: ${host.host ?? '(unknown)'}`);
    log.error(`${LOG} ${host.reason}; nothing was requested`);
    return 1;
  }
  log.info(`${LOG} ${args.command} on ${host.host}${args.dryRun ? ' — dry run, read-only' : ''}`);

  const client = deps.createClient();
  switch (args.command) {
    case 'apply':
      return applyTeams(client, args.dryRun, log);
    case 'finalize':
      return finalizeTeams(client, args.dryRun, log);
    case 'strip-user-permissions':
      return stripUserPermissions(client, args.dryRun, log);
  }
}

async function readAll<T>(readPage: (page: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const rows = await readPage(page);
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += PAGE) out.push(items.slice(i, i + PAGE));
  return out;
}

async function readSchemaState(client: MigrationClient): Promise<SchemaState> {
  const [collections, fields, relations] = await Promise.all([
    client.request(readCollections()),
    client.request(readFields()),
    client.request(readRelations()),
  ]);
  return {
    collections: new Set(collections.map((c) => c.collection)),
    fields: new Set(fields.map((f) => fieldKey(f.collection, f.field))),
    relations: new Set(relations.map((r) => fieldKey(r.collection, r.field))),
  };
}

async function countRows(client: MigrationClient, collection: BackfillCollection, onlyWithoutTeam: boolean) {
  const rows = await client.request(
    aggregate(collection, {
      aggregate: { count: '*' },
      ...(onlyWithoutTeam ? { query: { filter: { team: { _null: true } } } } : {}),
    }),
  );
  const count = Number((rows as unknown as { count?: unknown }[])[0]?.count ?? 0);
  if (!Number.isFinite(count)) throw new Error(`unexpected count for "${collection}"`);
  return count;
}

async function executeSchemaStep(client: MigrationClient, step: SchemaStep): Promise<void> {
  switch (step.kind) {
    case 'collection': {
      const { collection, meta } = step.spec;
      const { field, type, meta: pkMeta, schema } = step.primaryKey;
      await client.request(
        createCollection({ collection, meta, schema: {}, fields: [{ field, type, meta: pkMeta, schema }] }),
      );
      return;
    }
    case 'field': {
      const { collection, field, type, meta, schema } = step.spec;
      await client.request(createField(collection as keyof MigrationSchema, { field, type, meta, schema }));
      return;
    }
    case 'relation': {
      const { collection, field, related, onDelete } = step.spec;
      await client.request(
        createRelation({
          collection,
          field,
          related_collection: related,
          schema: { on_delete: onDelete },
          meta: { one_deselect_action: 'nullify' },
        }),
      );
      return;
    }
  }
}

async function applyTeams(client: MigrationClient, dryRun: boolean, log: Logger): Promise<number> {
  const schema = await readSchemaState(client);
  const steps = planSchema(schema);
  if (!steps.length) log.info(`${LOG} schema: up to date`);
  for (const step of steps) {
    if (dryRun) {
      log.info(`${LOG} [dry-run] would ${describeSchemaStep(step)}`);
    } else {
      await executeSchemaStep(client, step);
      log.info(`${LOG} ${describeSchemaStep(step)}: done`);
    }
  }
  // В dry-run схема не создавалась: читаем данные с поправкой на её отсутствие
  // (ключ — коллекция или `collection.field`).
  const has = (key: string) => !dryRun || schema.fields.has(key) || schema.collections.has(key);

  let nbcId: string | null = null;
  if (has('teams')) {
    const found = await client.request(
      readItems('teams', { filter: { slug: { _eq: NBC_TEAM.slug } }, fields: ['id'], limit: 1 }),
    );
    nbcId = found[0]?.id ?? null;
  }
  if (nbcId) {
    log.info(`${LOG} team "${NBC_TEAM.slug}" exists (${nbcId})`);
  } else if (dryRun) {
    log.info(`${LOG} [dry-run] would create team "${NBC_TEAM.slug}" (${NBC_TEAM.name})`);
  } else {
    const created = await client.request(createItem('teams', { slug: NBC_TEAM.slug, name: NBC_TEAM.name }));
    nbcId = created.id;
    log.info(`${LOG} team "${NBC_TEAM.slug}" created (${nbcId})`);
  }

  for (const collection of BACKFILL_COLLECTIONS) {
    if (dryRun || !nbcId) {
      const count = await countRows(client, collection, has(fieldKey(collection, 'team')));
      log.info(`${LOG} [dry-run] would set team="${NBC_TEAM.slug}" on ${count} row(s) of "${collection}"`);
    } else {
      const updated = await backfillTeam(client, collection, nbcId);
      log.info(`${LOG} backfill "${collection}": ${updated} row(s) set to team "${NBC_TEAM.slug}"`);
    }
  }

  const [roles, users, members] = await Promise.all([
    readAll((page) => client.request(readRoles({ fields: ['id', 'name'], sort: ['id'], limit: PAGE, page }))),
    readAll((page) => client.request(readUsers({ fields: ['id', 'role'], sort: ['id'], limit: PAGE, page }))),
    has('team_members')
      ? readAll((page) =>
          client.request(readItems('team_members', { fields: ['user'], sort: ['id'], limit: PAGE, page })),
        )
      : Promise.resolve([]),
  ]);
  const memberships = planMemberships({
    roles: roles.map((r) => ({ id: String(r.id), name: String(r.name) })),
    users: users.map((u) => ({ id: String(u.id), role: (u.role as string | null) ?? null })),
    memberUserIds: new Set(members.map((m) => String(m.user))),
  });
  log.info(
    `${LOG} users left untouched: other roles ${memberships.otherRole}, no role ${memberships.noRole}; ` +
      `already members ${memberships.alreadyMembers}`,
  );
  if (dryRun || !nbcId) {
    log.info(`${LOG} [dry-run] would add ${memberships.toAdd.length} user(s) to team "${NBC_TEAM.slug}"`);
    return 0;
  }
  for (const batch of chunks(memberships.toAdd)) {
    await client.request(createItems('team_members', batch.map((user) => ({ team: nbcId, user }))));
  }
  log.info(`${LOG} memberships: ${memberships.toAdd.length} user(s) added to team "${NBC_TEAM.slug}"`);
  return 0;
}

/** Пачками, пока остаются строки без команды: старый код может создавать их параллельно. */
async function backfillTeam(client: MigrationClient, collection: BackfillCollection, teamId: string) {
  const seen = new Set<string>();
  for (;;) {
    const rows = (await client.request(
      readItems(collection, { filter: { team: { _null: true } }, fields: ['id'], sort: ['id'], limit: PAGE }),
    )) as { id: string | number }[];
    if (!rows.length) return seen.size;
    const ids = rows.map((r) => r.id);
    if (ids.some((id) => seen.has(String(id)))) {
      throw new Error(`backfill of "${collection}" made no progress (row ${ids[0]} still has no team)`);
    }
    await client.request(updateItems(collection, ids as string[] | number[], { team: teamId }));
    for (const id of ids) seen.add(String(id));
  }
}

async function finalizeTeams(client: MigrationClient, dryRun: boolean, log: Logger): Promise<number> {
  const fields = await client.request(readFields());
  const state = {} as Record<RequiredTeamCollection, TeamFieldState>;
  for (const collection of REQUIRED_TEAM_COLLECTIONS) {
    const field = fields.find((f) => f.collection === collection && f.field === 'team');
    const nullable = field ? field.schema?.is_nullable !== false : undefined;
    const nullCount = field ? await countRows(client, collection, true) : 0;
    state[collection] = { nullable, nullCount };
  }
  const plan = planFinalize(state);
  if (!plan.ok) {
    log.error(`${LOG} finalize refused: ${plan.reason}; nothing was changed`);
    return 1;
  }
  if (!plan.toRequire.length) {
    log.info(`${LOG} "team" is already NOT NULL in ${REQUIRED_TEAM_COLLECTIONS.join(', ')}`);
    return 0;
  }
  for (const collection of plan.toRequire) {
    if (dryRun) {
      log.info(`${LOG} [dry-run] would set "${collection}.team" NOT NULL`);
      continue;
    }
    await client.request(
      updateField(collection, 'team', { type: 'uuid', meta: { required: true }, schema: { is_nullable: false } }),
    );
    log.info(`${LOG} "${collection}.team" is now NOT NULL`);
  }
  return 0;
}

async function stripUserPermissions(client: MigrationClient, dryRun: boolean, log: Logger): Promise<number> {
  const policyNames = [...new Set(STRIP_PERMISSIONS.map((r) => r.policy))];
  const policies = (
    await readAll((page) =>
      client.request(
        readPolicies({ filter: { name: { _in: policyNames } }, fields: ['id', 'name'], sort: ['id'], limit: PAGE, page }),
      ),
    )
  ).map((p) => ({ id: String(p.id), name: String(p.name) }));
  for (const name of policyNames) {
    if (!policies.some((p) => p.name === name)) log.info(`${LOG} policy "${name}" not found`);
  }

  const permissions: PermissionRow[] = policies.length
    ? (
        await readAll((page) =>
          client.request(
            readPermissions({
              filter: { policy: { _in: policies.map((p) => p.id) } },
              fields: ['id', 'policy', 'collection', 'action'],
              sort: ['id'],
              limit: PAGE,
              page,
            }),
          ),
        )
      ).map((p) => ({
        id: Number(p.id),
        policy: String(p.policy),
        collection: String(p.collection),
        action: String(p.action),
      }))
    : [];

  const matches = planStrip(policies, permissions);
  if (!matches.length) {
    log.info(`${LOG} nothing to delete`);
    return 0;
  }
  for (const m of matches) {
    log.info(`${LOG} ${dryRun ? '[dry-run] would delete' : 'delete'} permission #${m.id}: ${m.policyName} ${m.collection}.${m.action}`);
  }
  if (!dryRun) {
    await client.request(deletePermissions(matches.map((m) => m.id)));
    log.info(`${LOG} deleted ${matches.length} permission row(s)`);
  }
  return 0;
}
