import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSongShareUrl, shareSong } from './songShare';

const ORIGIN = 'https://example.org';

function stubNavigator(nav: Partial<Navigator>) {
  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('window', { location: { origin: ORIGIN } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('buildSongShareUrl', () => {
  it('ссылка внутри basePath (scope манифеста) — её перехватит установленная PWA', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/app');
    expect(buildSongShareUrl('42', ORIGIN)).toBe(`${ORIGIN}/app/s?id=42`);
  });
});

describe('shareSong', () => {
  const song = { id: '42', title: 'Песня' };

  it('есть системный шит → shared, буфер не трогаем', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } as unknown as Clipboard });

    expect(await shareSong(song)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Песня', url: expect.stringContaining('/s?id=42') });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('шит закрыли → cancelled, без фолбэка в буфер', async () => {
    const writeText = vi.fn();
    stubNavigator({
      share: vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')),
      clipboard: { writeText } as unknown as Clipboard,
    });

    expect(await shareSong(song)).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('шита нет → ссылка в буфер', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });

    expect(await shareSong(song)).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/s?id=42'));
  });

  it('шит упал не по отмене → фолбэк в буфер', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({
      share: vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
      clipboard: { writeText } as unknown as Clipboard,
    });

    expect(await shareSong(song)).toBe('copied');
  });

  it('ни шита, ни буфера → failed', async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } as unknown as Clipboard });
    expect(await shareSong(song)).toBe('failed');
  });
});
