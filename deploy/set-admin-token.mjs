#!/usr/bin/env node
/**
 * Log in to a fresh Directus with admin email/password and set a static token
 * on the admin user. Prints the token on stdout (last line).
 *
 * Env: DIRECTUS_URL, DIRECTUS_ADMIN_EMAIL, DIRECTUS_ADMIN_PASSWORD, [DIRECTUS_ADMIN_TOKEN]
 */
import { randomBytes } from 'node:crypto';

const base = (process.env.DIRECTUS_URL || 'http://directus:8055').replace(/\/$/, '');
const email = process.env.DIRECTUS_ADMIN_EMAIL;
const password = process.env.DIRECTUS_ADMIN_PASSWORD;
const wanted = process.env.DIRECTUS_ADMIN_TOKEN || randomBytes(24).toString('base64url');

async function j(path, opts = {}) {
  const res = await fetch(`${base}${path}`, opts);
  const t = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${opts.method || 'GET'} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}

const login = await j('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const access = login.data.access_token;
const auth = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' };

const me = await j('/users/me?fields=id,email', { headers: auth });
await j(`/users/${me.data.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ token: wanted }) });

// verify
const check = await j('/users/me?fields=email', { headers: { Authorization: `Bearer ${wanted}` } });
process.stderr.write(`token works for ${check.data.email}\n`);
process.stdout.write(wanted + '\n');
