import { getBasePath } from '@/shared/utils/api';

/**
 * Ссылка «Поделиться» на песню. Маршрут `/s` лежит внутри scope манифеста (`{basePath}/`),
 * поэтому на Android установленная PWA перехватывает её сама; вошедшего страница уводит
 * в `/dashboard/song`, гость видит публичный просмотр (если песня открыта всем).
 */
export function buildSongShareUrl(songId: string, origin: string = window.location.origin): string {
  return `${origin}${getBasePath()}/s?id=${encodeURIComponent(songId)}`;
}

export type SongShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Системный шит «Поделиться» (мессенджеры на телефоне), без него — копирование в буфер.
 * Закрытый пользователем шит — `cancelled`, а не ошибка: фолбэк на буфер там не нужен.
 */
export async function shareSong(song: { id: string; title: string }): Promise<SongShareResult> {
  const url = buildSongShareUrl(song.id);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: song.title, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      console.warn('[songShare] navigator.share failed, falling back to clipboard', err);
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (err) {
    console.error('[songShare] clipboard write failed', err);
    return 'failed';
  }
}
