import { describe, expect, it, vi } from 'vitest';
import { run, type Logger, type TeamsClient } from './run';

interface Req {
  path: string;
  method?: string;
  params?: Record<string, unknown>;
  body?: string;
}

const LOCAL = 'http://localhost:18055';
const ARGS = ['--name=Church X', '--slug=church-x', '--confirm-host=localhost:18055'];

const UNSTRIPPED = { id: 7, policy: 'pol-custom', collection: 'setlists', action: 'read' };

function setup(existing: { id: string; name: string } | null, permissions: object[] = []) {
  const calls: Req[] = [];
  const client = {
    request: vi.fn(async (command: unknown) => {
      const req = (command as () => Req)();
      calls.push(req);
      if (req.path === '/policies') return [{ id: 'pol-custom', name: 'custom' }];
      if (req.path === '/permissions') return permissions;
      if (req.method === 'POST') return { id: 'new-team-id' };
      return existing ? [existing] : [];
    }),
  } as unknown as TeamsClient;
  const lines: string[] = [];
  const log: Logger = { info: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) };
  const createClient = vi.fn(() => client);
  const issueInvite = vi.fn(async () => ({ url: 'http://app/activate?token=t' }));
  const exec = (argv: string[], directusUrl: string | undefined = LOCAL) =>
    run(argv, { directusUrl, createClient, issueInvite, log });
  return { calls, lines, createClient, issueInvite, exec };
}

describe('create-team', () => {
  it('refuses a host mismatch without creating a client or sending requests', async () => {
    const t = setup(null);
    const code = await t.exec(['--name=Church X', '--slug=church-x', '--confirm-host=prod.example.com']);
    expect(code).toBe(1);
    expect(t.createClient).not.toHaveBeenCalled();
    expect(t.calls).toEqual([]);
    expect(t.issueInvite).not.toHaveBeenCalled();
    expect(t.lines.join('\n')).toContain('localhost:18055');
  });

  it('refuses a missing --confirm-host', async () => {
    const t = setup(null);
    expect(await t.exec(['--name=Church X', '--slug=church-x'])).toBe(1);
    expect(t.createClient).not.toHaveBeenCalled();
  });

  it.each(['A', 'x', 'has space', 'UPPER', 'a_b', 'a'.repeat(41), ''])('rejects slug %j', async (slug) => {
    const t = setup(null);
    expect(await t.exec(['--name=Church X', `--slug=${slug}`, '--confirm-host=localhost:18055'])).toBe(1);
    expect(t.createClient).not.toHaveBeenCalled();
  });

  it('requires name and rejects unknown arguments', async () => {
    const t = setup(null);
    expect(await t.exec(['--slug=church-x', '--confirm-host=localhost:18055'])).toBe(1);
    expect(await t.exec([...ARGS, '--oops'])).toBe(1);
    expect(t.createClient).not.toHaveBeenCalled();
  });

  it('creates a new team and issues a team_admin invite for it', async () => {
    const t = setup(null);
    expect(await t.exec(ARGS)).toBe(0);
    const post = t.calls.find((c) => c.method === 'POST');
    expect(post?.path).toBe('/items/teams');
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ slug: 'church-x', name: 'Church X' });
    expect(t.issueInvite).toHaveBeenCalledWith({ teamId: 'new-team-id', label: 'team_admin: Church X' });
    const out = t.lines.join('\n');
    expect(out).toContain('http://app/activate?token=t');
    expect(out).toContain('in person');
  });

  it('for an existing team with the same name only issues a new invite and says so', async () => {
    const t = setup({ id: 'team-1', name: 'Church X' });
    expect(await t.exec(ARGS)).toBe(0);
    expect(t.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(t.issueInvite).toHaveBeenCalledWith({ teamId: 'team-1', label: 'team_admin: Church X' });
    expect(t.lines.join('\n')).toContain('already exists');
  });

  it('exits 1 when the slug belongs to a team with another name', async () => {
    const t = setup({ id: 'team-1', name: 'Other Church' });
    expect(await t.exec(ARGS)).toBe(1);
    expect(t.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(t.issueInvite).not.toHaveBeenCalled();
    expect(t.lines.join('\n')).toContain('already taken');
  });

  it('refuses while user permissions are not stripped: no writes, no invite', async () => {
    const t = setup(null, [UNSTRIPPED]);
    expect(await t.exec(ARGS)).toBe(1);
    expect(t.calls.some((c) => c.method === 'POST')).toBe(false);
    expect(t.issueInvite).not.toHaveBeenCalled();
    expect(t.lines.join('\n')).toContain('strip-user-permissions');
  });

  it('ignores permission rows that are not in the strip plan', async () => {
    const t = setup(null, [{ id: 8, policy: 'pol-custom', collection: 'song_user_state', action: 'read' }]);
    expect(await t.exec(ARGS)).toBe(0);
    expect(t.issueInvite).toHaveBeenCalled();
  });

  it('dry run with unstripped permissions only warns', async () => {
    const t = setup(null, [UNSTRIPPED]);
    expect(await t.exec([...ARGS, '--dry-run'])).toBe(0);
    expect(t.calls.every((c) => (c.method ?? 'GET') === 'GET')).toBe(true);
    expect(t.lines.join('\n')).toContain('warning');
    expect(t.issueInvite).not.toHaveBeenCalled();
  });

  it('dry run only reads', async () => {
    for (const existing of [null, { id: 'team-1', name: 'Church X' }]) {
      const t = setup(existing);
      expect(await t.exec([...ARGS, '--dry-run'])).toBe(0);
      expect(t.calls.filter((c) => c.path === '/items/teams').length).toBe(1);
      expect(t.calls.every((c) => (c.method ?? 'GET') === 'GET')).toBe(true);
      expect(t.issueInvite).not.toHaveBeenCalled();
      expect(t.lines.join('\n')).toContain('[dry-run]');
    }
  });
});
