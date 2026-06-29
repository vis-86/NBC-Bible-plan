import { describe, it, expect } from 'vitest';
import { sealData, unsealData } from 'iron-session';

// Проверяем сам контракт seal/unseal с тем же паролем, что и в session.ts.
// (createSession/getSession завязаны на next/headers и NextResponse — это покрывается
//  интеграционно; здесь — криптографический round-trip.)
const opts = { password: process.env.SESSION_SECRET as string, ttl: 60 * 60 * 24 * 30 };

describe('session sealing', () => {
  it('round-trips session payload', async () => {
    const data = { directus_id: 'u1', first_name: 'Иван' };
    const sealed = await sealData(data, opts);
    expect(typeof sealed).toBe('string');
    expect(sealed).not.toContain('directus_id'); // зашифровано
    const out = await unsealData<typeof data>(sealed, opts);
    expect(out.directus_id).toBe('u1');
    expect(out.first_name).toBe('Иван');
  });

  it('does not recover payload with a different secret', async () => {
    const sealed = await sealData({ directus_id: 'u1' }, opts);
    // iron-session возвращает {} (без directus_id) — наш unseal() трактует это как null.
    const out = await unsealData<{ directus_id?: string }>(sealed, {
      password: 'another-secret-minimum-32-characters!!!',
    });
    expect(out.directus_id).toBeUndefined();
  });
});
