/**
 * Заведение команды и инвайта для её первого администратора: разбор аргументов, проверка хоста,
 * чтение/создание команды. Клиент и выпуск инвайта передаются снаружи — тесты подставляют моки.
 */
import { createItem, readItems, readPermissions, readPolicies, type RestCommand } from '@directus/sdk';
import { STRIP_PERMISSIONS, checkHost, planStrip, type StripMatch } from '../add-teams/plan';

export interface TeamsSchema {
  teams: { id: string; name: string; slug: string }[];
}

export interface TeamsClient {
  // Права и политики — системные коллекции Directus, схема `teams` их не описывает.
  request<Output>(command: RestCommand<Output, TeamsSchema>): Promise<Output>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface RunDeps {
  /** `NEXT_PUBLIC_DIRECTUS_URL` — по нему же ходит admin-клиент. */
  directusUrl: string | undefined;
  /** Вызывается только после проверки хоста. */
  createClient: () => TeamsClient;
  /** Выпускает инвайт `team_admin` для команды; возвращает ссылку. */
  issueInvite: (input: { teamId: string; label: string }) => Promise<{ url: string }>;
  log: Logger;
}

export const LOG = '[create-team]';
export const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
const MAX_NAME_LENGTH = 100;

export const USAGE =
  'usage: npx tsx scripts/create-team.ts --name="Church X" --slug=church-x --confirm-host=<host> [--dry-run]';

type ParsedArgs =
  | { ok: true; name: string; slug: string; confirmHost: string | undefined; dryRun: boolean }
  | { ok: false; reason: string };

export function parseArgs(argv: readonly string[]): ParsedArgs {
  let name: string | undefined;
  let slug: string | undefined;
  let confirmHost: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--name=')) name = arg.slice('--name='.length).trim();
    else if (arg.startsWith('--slug=')) slug = arg.slice('--slug='.length);
    else if (arg.startsWith('--confirm-host=')) confirmHost = arg.slice('--confirm-host='.length);
    else return { ok: false, reason: `unknown argument "${arg}"` };
  }
  if (!name) return { ok: false, reason: '--name is required' };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, reason: `--name is longer than ${MAX_NAME_LENGTH} characters` };
  if (!slug) return { ok: false, reason: '--slug is required' };
  if (!SLUG_PATTERN.test(slug)) return { ok: false, reason: `--slug must match ${SLUG_PATTERN}` };
  return { ok: true, name, slug, confirmHost, dryRun };
}

const PAGE = 100;

async function readAll<T>(readPage: (page: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page += 1) {
    const rows = await readPage(page);
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

/** Права, которые `add-teams strip-user-permissions` ещё не снял (тот же план и то же чтение, что в add-teams). */
async function findUnstrippedPermissions(client: TeamsClient): Promise<StripMatch[]> {
  const policyNames = [...new Set(STRIP_PERMISSIONS.map((r) => r.policy))];
  const policies = (
    await readAll((page) =>
      client.request(
        readPolicies({ filter: { name: { _in: policyNames } }, fields: ['id', 'name'], sort: ['id'], limit: PAGE, page }),
      ),
    )
  ).map((p) => ({ id: String(p.id), name: String(p.name) }));
  if (!policies.length) return [];
  const permissions = (
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
  }));
  return planStrip(policies, permissions);
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
  log.info(`${LOG} team "${args.slug}" on ${host.host}${args.dryRun ? ' — dry run, read-only' : ''}`);

  const client = deps.createClient();
  // Второй рубеж Directus: пока у пользовательских политик есть права на сеты/чтение, участники
  // новой команды могли бы работать с чужими данными напрямую в Directus.
  const unstripped = await findUnstrippedPermissions(client);
  if (unstripped.length) {
    const list = unstripped.map((m) => `${m.policyName} ${m.collection}.${m.action}`).join(', ');
    if (!args.dryRun) {
      log.error(
        `${LOG} ${unstripped.length} user permission row(s) are not stripped yet (${list}); ` +
          'run `npx tsx scripts/add-teams.ts strip-user-permissions` first; nothing was changed',
      );
      return 1;
    }
    log.warn(
      `${LOG} [dry-run] warning: ${unstripped.length} user permission row(s) are not stripped yet (${list}); ` +
        'a real run will refuse until `add-teams strip-user-permissions` is done',
    );
  }
  const found = await client.request(
    readItems('teams', { filter: { slug: { _eq: args.slug } }, fields: ['id', 'name'], limit: 1 }),
  );
  const existing = found[0];

  if (existing && existing.name !== args.name) {
    log.error(
      `${LOG} slug "${args.slug}" is already taken by team "${existing.name}"; nothing was changed`,
    );
    return 1;
  }

  if (args.dryRun) {
    log.info(
      existing
        ? `${LOG} [dry-run] team "${args.slug}" exists (${existing.id}): would issue a new team_admin invite`
        : `${LOG} [dry-run] would create team "${args.slug}" (${args.name}) and issue a team_admin invite`,
    );
    return 0;
  }

  let teamId: string;
  if (existing) {
    teamId = existing.id;
    log.info(`${LOG} team "${args.slug}" already exists (${teamId}): issuing a NEW team_admin invite for it`);
  } else {
    const created = await client.request(createItem('teams', { slug: args.slug, name: args.name }));
    teamId = created.id;
    log.info(`${LOG} team "${args.slug}" created (${teamId})`);
  }

  const invite = await deps.issueInvite({ teamId, label: `team_admin: ${args.name}` });
  log.info(`${LOG} team_admin invite link (one-time, hand it over in person):`);
  log.info(invite.url);
  return 0;
}
