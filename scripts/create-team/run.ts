/**
 * Заведение команды и инвайта для её первого администратора: разбор аргументов, проверка хоста,
 * чтение/создание команды. Клиент и выпуск инвайта передаются снаружи — тесты подставляют моки.
 */
import { createItem, readItems, type RestCommand } from '@directus/sdk';
import { checkHost } from '../add-teams/plan';

export interface TeamsSchema {
  teams: { id: string; name: string; slug: string }[];
}

export interface TeamsClient {
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
