import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { SESSION_COOKIE_NAME, sealSession } from '../../src/lib/session-core';
import { createSession, deleteSession, getSession } from './session';

function makeApp() {
  const app = new Hono();
  app.get('/whoami', async (c) => {
    const session = await getSession(c);
    return c.json({ session });
  });
  app.post('/login', async (c) => {
    await createSession(c, { directus_id: 'u1', first_name: 'Иван' });
    return c.json({ ok: true });
  });
  app.post('/logout', (c) => {
    deleteSession(c);
    return c.json({ ok: true });
  });
  return app;
}

describe('bff session helpers', () => {
  it('unseals a cookie sealed by the core', async () => {
    const sealed = await sealSession({ directus_id: 'u1', first_name: 'Иван', username: 'ivan' });
    const res = await makeApp().request('/whoami', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${sealed}` },
    });
    const body = (await res.json()) as { session: unknown };
    expect(body.session).toMatchObject({ directus_id: 'u1', first_name: 'Иван', username: 'ivan' });
  });

  it('returns null without a cookie', async () => {
    const res = await makeApp().request('/whoami');
    expect(((await res.json()) as { session: unknown }).session).toBeNull();
  });

  it('returns null for a broken cookie', async () => {
    const res = await makeApp().request('/whoami', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=garbage-value` },
    });
    expect(((await res.json()) as { session: unknown }).session).toBeNull();
  });

  it('createSession sets httpOnly cookie with path=/', async () => {
    const res = await makeApp().request('/login', { method: 'POST' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
  });

  it('deleteSession sets an expiring cookie', async () => {
    const res = await makeApp().request('/logout', { method: 'POST' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('Path=/');
  });
});
