// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { __deleteDB, getDB } from './db';
import { OFFLINE_OWNER_META_KEY, ensureOfflineOwner, forgetForeignLastKnownUser, claimOwnerFromLastKnownUser } from './offlineOwner';
import { getLastKnownUser, setLastKnownUser } from './lastKnownUser';
import { SYNC_ETAG_META_KEY, SYNC_VERSIONS_META_KEY } from './syncVersions';

async function seed() {
  const db = await getDB();
  const now = Date.now();
  await db.put('songs', { id: '1', data: {}, updatedAt: now });
  await db.put('songState', { songId: '1', strokes: [], updatedAt: now });
  await db.put('outbox', { kind: 'songAnnotations', id: 'o1', songId: 1, payload: { strokes: [], updatedAt: now }, ts: now });
  await db.put('apiCache', { key: 'songs:list', data: {}, updatedAt: now });
  await db.put('meta', { key: SYNC_VERSIONS_META_KEY, value: { songs: {}, setlists: {}, plan: null } });
  await db.put('meta', { key: SYNC_ETAG_META_KEY, value: 'etag' });
  await db.put('manifest', { key: 'songs', downloadedAt: now });
  await db.put('manifest', { key: 'plan', downloadedAt: now });
  await db.put('manifest', { key: 'setlists', downloadedAt: now });
  await db.put('manifest', { key: 'rst', downloadedAt: now });
  await db.put('bibleChapters', { key: 'rst|GEN|1', translationId: 'rst', book: 'GEN', chapter: 1, text: 't', updatedAt: now });
}

describe('offline/offlineOwner', () => {
  beforeEach(async () => {
    await __deleteDB();
  });

  it('claimed: первого пользователя фиксирует, данные не трогает', async () => {
    await seed();
    expect(await ensureOfflineOwner('u1')).toBe('claimed');
    const db = await getDB();
    expect((await db.get('meta', OFFLINE_OWNER_META_KEY))?.value).toBe('u1');
    expect(await db.count('songs')).toBe(1);
    expect(await db.count('outbox')).toBe(1);
  });

  it('same: тот же пользователь — без очистки', async () => {
    await ensureOfflineOwner('u1');
    await seed();
    expect(await ensureOfflineOwner('u1')).toBe('same');
    const db = await getDB();
    expect(await db.count('songs')).toBe(1);
    expect(await db.count('apiCache')).toBe(1);
  });

  it('wiped: другой пользователь — очищает пользовательское, Писание остаётся', async () => {
    await ensureOfflineOwner('u1');
    await seed();
    expect(await ensureOfflineOwner('u2')).toBe('wiped');
    const db = await getDB();
    expect(await db.count('songs')).toBe(0);
    expect(await db.count('songState')).toBe(0);
    expect(await db.count('outbox')).toBe(0);
    expect(await db.count('apiCache')).toBe(0);
    expect(await db.get('meta', SYNC_VERSIONS_META_KEY)).toBeUndefined();
    expect(await db.get('meta', SYNC_ETAG_META_KEY)).toBeUndefined();
    expect(await db.getAllKeys('manifest')).toEqual(['rst']);
    expect(await db.count('bibleChapters')).toBe(1);
    expect((await db.get('meta', OFFLINE_OWNER_META_KEY))?.value).toBe('u2');
  });

  it('повторный вызов после wiped с тем же id — same, новые данные целы', async () => {
    await ensureOfflineOwner('u1');
    await seed();
    await ensureOfflineOwner('u2');
    const db = await getDB();
    await db.put('songs', { id: '9', data: {}, updatedAt: Date.now() });
    expect(await ensureOfflineOwner('u2')).toBe('same');
    expect(await db.count('songs')).toBe(1);
  });

  it('первый запуск, last-known-user другой -> wiped, а не claimed', async () => {
    await seed();
    await setLastKnownUser({ directus_id: 'u-old', first_name: 'A' });
    expect(await ensureOfflineOwner('u2')).toBe('wiped');
    const db = await getDB();
    expect(await db.count('songs')).toBe(0);
    expect((await db.get('meta', OFFLINE_OWNER_META_KEY))?.value).toBe('u2');
  });

  it('первый запуск, last-known-user тот же -> claimed без очистки', async () => {
    await seed();
    await setLastKnownUser({ directus_id: 'u2', first_name: 'A' });
    expect(await ensureOfflineOwner('u2')).toBe('claimed');
    expect(await (await getDB()).count('songs')).toBe(1);
  });

  it('forgetForeignLastKnownUser: чужого снимает, своего и без id — нет', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'A' });
    await forgetForeignLastKnownUser('u1');
    expect(await getLastKnownUser()).toBeDefined();
    await forgetForeignLastKnownUser(undefined);
    expect(await getLastKnownUser()).toBeDefined();
    await forgetForeignLastKnownUser('u2');
    expect(await getLastKnownUser()).toBeUndefined();
  });

  it('claimOwnerFromLastKnownUser: пишет владельца только если его нет', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'A' });
    await claimOwnerFromLastKnownUser();
    const db = await getDB();
    expect((await db.get('meta', OFFLINE_OWNER_META_KEY))?.value).toBe('u1');
    await setLastKnownUser({ directus_id: 'u2', first_name: 'B' });
    await claimOwnerFromLastKnownUser();
    expect((await db.get('meta', OFFLINE_OWNER_META_KEY))?.value).toBe('u1');
  });
});
