import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getReadingPlanMock, getWeeklyPlanItemsMock, getSongsListMock, getSongByIdMock, getUserTeamIdMock } =
  vi.hoisted(() => ({
    getReadingPlanMock: vi.fn(),
    getWeeklyPlanItemsMock: vi.fn(),
    getSongsListMock: vi.fn(),
    getSongByIdMock: vi.fn(),
    getUserTeamIdMock: vi.fn(),
  }));

vi.mock('../../../src/lib/directus-data', () => ({
  getReadingPlan: getReadingPlanMock,
  getWeeklyPlanItems: getWeeklyPlanItemsMock,
  getReadingSettings: vi.fn(),
}));
vi.mock('../../../src/features/songs/services/songsServer', () => ({
  getSongsList: getSongsListMock,
  getSongById: getSongByIdMock,
}));
vi.mock('../../../src/lib/teams', () => ({
  getUserTeamId: getUserTeamIdMock,
}));

import { sealSession, SESSION_COOKIE_NAME } from '../../../src/lib/session-core';
import { createApp } from '../app';

/** Песни отдаются только вошедшим — запросы ниже идут с валидной сессией. */
async function withSession(): Promise<RequestInit> {
  const sealed = await sealSession({ directus_id: 'user-1', first_name: 'Test' });
  return { headers: { Cookie: `${SESSION_COOKIE_NAME}=${sealed}` } };
}

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  process.env.NEXT_PUBLIC_DIRECTUS_URL = 'http://localhost:8055';
  getReadingPlanMock.mockReset();
  getWeeklyPlanItemsMock.mockReset();
  getSongsListMock.mockReset();
  getSongByIdMock.mockReset();
  getUserTeamIdMock.mockReset();
  getUserTeamIdMock.mockResolvedValue('team-a');
});

describe('GET /app/api/bible/books', () => {
  it('отдаёт список книг', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/books');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.books)).toBe(true);
    expect(body.books.length).toBeGreaterThan(0);
  });
});

describe('GET /app/api/bible/:book/:chapter', () => {
  it('отдаёт текст главы для известной книги', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/Бытие/1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.book).toBe('Бытие');
    expect(body.chapter).toBe(1);
    expect(body.text).toBeTruthy();
  });

  it('404 для неизвестной книги', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/НеКнига/1');
    expect(res.status).toBe(404);
  });

  it('уважает ?translation=', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/Бытие/1?translation=rst');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.translation).toBe('rst');
  });
});

describe('GET /app/api/bible/download/:translation', () => {
  it('404 для неизвестного перевода', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/download/klingon');
    expect(res.status).toBe(404);
  });

  it('агрегирует index + книги для валидного self-hosted перевода', async () => {
    const app = createApp();
    const res = await app.request('/app/api/bible/download/rst');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.translation).toBe('rst');
    expect(body.books['Бытие']).toBeDefined();
  });
});

describe('GET /app/api/plan', () => {
  it('отдаёт план чтения', async () => {
    getReadingPlanMock.mockResolvedValue([{ id: '1', day: 1 }]);
    const app = createApp();
    const res = await app.request('/app/api/plan');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toEqual([{ id: '1', day: 1 }]);
  });
});

describe('GET /app/api/plan/weekly', () => {
  it('группирует по неделям', async () => {
    getWeeklyPlanItemsMock.mockResolvedValue([
      { id: '1', numbers: 2, item: 2, read: 'b' },
      { id: '2', numbers: 1, item: 1, read: 'a' },
      { id: '3', numbers: 1, item: 2, read: 'c' },
    ]);
    const app = createApp();
    const res = await app.request('/app/api/plan/weekly?book=proverbs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.book).toBe('proverbs');
    expect(body.weeks.map((w: { week: number }) => w.week)).toEqual([1, 2]);
    expect(body.weeks[0].items.map((i: { item: number }) => i.item)).toEqual([1, 2]);
  });
});

describe('GET /app/api/songs', () => {
  it('отдаёт список песен', async () => {
    getSongsListMock.mockResolvedValue([{ id: 1, title: 'Song' }]);
    const app = createApp();
    const res = await app.request('/app/api/songs', await withSession());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.songs).toEqual([{ id: 1, title: 'Song' }]);
  });

  it('список — команды из сессии; ?team= в query игнорируется', async () => {
    getSongsListMock.mockResolvedValue([]);
    const res = await createApp().request('/app/api/songs?team=team-b', await withSession());
    expect(res.status).toBe(200);
    expect(getSongsListMock).toHaveBeenCalledTimes(1);
    expect(getSongsListMock).toHaveBeenCalledWith('team-a');
  });

  it('без команды -> 403, список не запрашивается', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const res = await createApp().request('/app/api/songs', await withSession());
    expect(res.status).toBe(403);
    expect(getSongsListMock).not.toHaveBeenCalled();
  });
});

describe('GET /app/api/songs/:id', () => {
  it('400 для невалидного id', async () => {
    const app = createApp();
    const res = await app.request('/app/api/songs/abc', await withSession());
    expect(res.status).toBe(400);
  });

  it('404 если песня не найдена', async () => {
    getSongByIdMock.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/app/api/songs/999', await withSession());
    expect(res.status).toBe(404);
  });

  it('200 с песней, если найдена', async () => {
    getSongByIdMock.mockResolvedValue({ id: 1, title: 'Song', content: 'lyrics' });
    const app = createApp();
    const res = await app.request('/app/api/songs/1', await withSession());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.song.id).toBe(1);
    expect(getSongByIdMock).toHaveBeenCalledWith('team-a', 1);
  });

  it('без команды -> 403, песня не запрашивается', async () => {
    getUserTeamIdMock.mockResolvedValue(null);
    const res = await createApp().request('/app/api/songs/1', await withSession());
    expect(res.status).toBe(403);
    expect(getSongByIdMock).not.toHaveBeenCalled();
  });

  it('сбой Directus -> 500, а не 404', async () => {
    getSongByIdMock.mockRejectedValue(new Error('directus down'));
    const res = await createApp().request('/app/api/songs/1', await withSession());
    expect(res.status).toBe(500);
  });
});
