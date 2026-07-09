import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getReadingPlanMock, getWeeklyPlanItemsMock, getSongsListMock, getSongByIdMock } = vi.hoisted(() => ({
  getReadingPlanMock: vi.fn(),
  getWeeklyPlanItemsMock: vi.fn(),
  getSongsListMock: vi.fn(),
  getSongByIdMock: vi.fn(),
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

import { createApp } from '../app';

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars-long';
  process.env.NEXT_PUBLIC_DIRECTUS_URL = 'http://localhost:8055';
  getReadingPlanMock.mockReset();
  getWeeklyPlanItemsMock.mockReset();
  getSongsListMock.mockReset();
  getSongByIdMock.mockReset();
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
    const res = await app.request('/app/api/songs');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.songs).toEqual([{ id: 1, title: 'Song' }]);
  });
});

describe('GET /app/api/songs/:id', () => {
  it('400 для невалидного id', async () => {
    const app = createApp();
    const res = await app.request('/app/api/songs/abc');
    expect(res.status).toBe(400);
  });

  it('404 если песня не найдена', async () => {
    getSongByIdMock.mockResolvedValue(null);
    const app = createApp();
    const res = await app.request('/app/api/songs/999');
    expect(res.status).toBe(404);
  });

  it('200 с песней, если найдена', async () => {
    getSongByIdMock.mockResolvedValue({ id: 1, title: 'Song', content: 'lyrics' });
    const app = createApp();
    const res = await app.request('/app/api/songs/1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.song.id).toBe(1);
  });
});
