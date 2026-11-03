// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const replaceMock = vi.hoisted(() => vi.fn());
const getPublicSongMock = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null as null | { directus_id: string }, loading: false }));
const params = vi.hoisted(() => ({ id: '7' as string | null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, prefetch: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'id' ? params.id : null) }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/shared/services/api/endpoints', () => ({ songsApi: { getPublicSong: getPublicSongMock } }));
// Лист песни проверяется своими тестами — здесь важно только, что он отрисован.
vi.mock('@/features/songs/components/SongView', () => ({
  SongView: ({ content }: { content: string }) => <div data-testid="song-view">{content}</div>,
}));

import { ApiClientError } from '@/shared/services/api/client';
import PublicSongPage from './page';

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
  replaceMock.mockReset();
  getPublicSongMock.mockReset();
  auth.user = null;
  auth.loading = false;
  params.id = '7';
});

describe('/s — ссылка на песню', () => {
  it('вошедший уходит в дашборд', async () => {
    auth.user = { directus_id: 'u1' };
    render(<PublicSongPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/song?id=7'));
  });

  it('пользователь из last-known-user — редирект сразу, не дожидаясь ответа сети', async () => {
    auth.user = { directus_id: 'u1' };
    auth.loading = true;
    render(<PublicSongPage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard/song?id=7'));
  });

  it('пока сессия проверяется — без редиректа, но песня уже запрошена (параллельно)', async () => {
    auth.loading = true;
    getPublicSongMock.mockResolvedValue({ song: { id: '7', title: 'Песня', content: '[G]Слава' } });
    render(<PublicSongPage />);

    await waitFor(() => expect(getPublicSongMock).toHaveBeenCalledWith('7'));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('song-view')).not.toBeInTheDocument();
  });

  it('гость видит открытую песню', async () => {
    getPublicSongMock.mockResolvedValue({ song: { id: '7', title: 'Велик Господь', content: '[G]Слава' } });
    render(<PublicSongPage />);

    expect(await screen.findByTestId('song-view')).toHaveTextContent('[G]Слава');
    expect(screen.getByRole('heading', { name: 'Велик Господь' })).toBeInTheDocument();
    expect(getPublicSongMock).toHaveBeenCalledWith('7');
  });

  it('закрытая/несуществующая песня → «недоступна» с входом', async () => {
    getPublicSongMock.mockRejectedValue(new ApiClientError('Not found', 404));
    render(<PublicSongPage />);

    expect(await screen.findByText('Песня недоступна')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it.each([
    ['church', 'участникам церкви'],
    ['worship', 'участникам команды'],
  ])('«недоступна»: текст по режиму %s', async (mode, text) => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', mode);
    getPublicSongMock.mockRejectedValue(new ApiClientError('Not found', 404));
    render(<PublicSongPage />);
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });

  it('сетевой сбой → повтор, а не «недоступна»', async () => {
    getPublicSongMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<PublicSongPage />);

    expect(await screen.findByText('Не удалось загрузить')).toBeInTheDocument();
  });

  it('ссылка без id', () => {
    params.id = null;
    render(<PublicSongPage />);

    expect(screen.getByText('Ссылка неполная')).toBeInTheDocument();
  });
});
