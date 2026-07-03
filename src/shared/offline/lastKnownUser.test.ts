// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getLastKnownUser, setLastKnownUser, clearLastKnownUser } from './lastKnownUser';
import { __resetDBConnection } from './db';

interface TestUser {
  directus_id: string;
  first_name: string;
}

describe('offline/lastKnownUser', () => {
  beforeEach(() => {
    __resetDBConnection();
  });

  it('возвращает undefined, если пользователь ещё не сохранён', async () => {
    expect(await getLastKnownUser<TestUser>()).toBeUndefined();
  });

  it('сохраняет и возвращает последнего известного пользователя', async () => {
    const user: TestUser = { directus_id: 'u1', first_name: 'Игорь' };
    await setLastKnownUser(user);
    expect(await getLastKnownUser<TestUser>()).toEqual(user);
  });

  it('clearLastKnownUser удаляет запись (обязателен на logout)', async () => {
    await setLastKnownUser({ directus_id: 'u1', first_name: 'Игорь' });
    await clearLastKnownUser();
    expect(await getLastKnownUser<TestUser>()).toBeUndefined();
  });
});
