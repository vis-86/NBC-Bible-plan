import { describe, expect, it } from 'vitest';
import { GET } from './route';

function req(): Request {
  return new Request('http://localhost/api/bible/download/rst');
}

describe('GET /api/bible/download/[translation]', () => {
  it('отдаёт агрегат index + все книги для валидного self-hosted перевода', async () => {
    const res = await GET(req(), { params: Promise.resolve({ translation: 'rst' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.translation).toBe('rst');
    expect(body.books['Бытие']).toBeDefined();
    expect(body.books['Бытие'].chapters['1']).toBeTruthy();
  });

  it('404 для неизвестного перевода', async () => {
    const res = await GET(req(), { params: Promise.resolve({ translation: 'klingon' }) });
    expect(res.status).toBe(404);
  });

  it('403 для перевода без разрешения на self-hosted раздачу', async () => {
    const res = await GET(req(), { params: Promise.resolve({ translation: 'nrp' }) });
    expect(res.status).toBe(403);
  });
});
