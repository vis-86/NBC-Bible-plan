'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { songsApi } from '@/shared/services/api/endpoints';
import { readSongThroughSWR } from '../lib/offlineSongs';
import type { Song } from '../types';

/**
 * Уже показанные в этой сессии песни. Нужен, чтобы повторное открытие (навигация по
 * сету) рисовало текст СИНХРОННО, без кадра скелета: даже чтение из IDB асинхронно.
 */
const seen = new Map<string, Song>();

/** Поля, изменение которых пользователь реально увидит на листе. */
function isSameRendered(a: Song, b: Song): boolean {
  return (
    a.content === b.content &&
    a.title === b.title &&
    a.key === b.key &&
    a.defaultKey === b.defaultKey
  );
}

/**
 * Загрузка одной песни по id (для страницы просмотра). Cache-first: кеш отдаётся сразу,
 * сеть идёт фоном. Свежая версия НЕ подменяет открытый лист автоматически — на служении
 * текст не должен уезжать под руками (и якоря ink-пометок привязаны к строкам показанной
 * версии). Вместо подмены поднимается `freshAvailable`; применяет её пользователь через
 * `applyFresh()`. Исключение: если отрендеренное содержимое идентично — применяем молча.
 */
export function useSong(id: string | number | null) {
  const key = id == null || id === '' ? null : String(id);
  const [song, setSong] = useState<Song | null>(() => (key ? (seen.get(key) ?? null) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshAvailable, setFreshAvailable] = useState(false);

  /** Свежая версия, ожидающая явного применения. */
  const pendingFresh = useRef<Song | null>(null);
  /** Показанная сейчас версия — для сравнения с пришедшей из сети. */
  const shown = useRef<Song | null>(null);

  useEffect(() => {
    pendingFresh.current = null;
    setFreshAvailable(false);

    if (key === null) {
      shown.current = null;
      setSong(null);
      setError(null);
      setLoading(false);
      return;
    }

    let active = true;
    const known = seen.get(key) ?? null;
    shown.current = known;
    setSong(known);
    setError(null);
    // Скелет — только когда показать нечего.
    setLoading(known === null);

    const remember = (loaded: Song) => {
      seen.set(key, loaded);
      shown.current = loaded;
      setSong(loaded);
    };

    readSongThroughSWR(key, () => songsApi.getSong(key).then((res) => res.song), {
      onFresh: (fresh) => {
        if (!active) return;
        seen.set(key, fresh);
        const current = shown.current;
        if (current === null || isSameRendered(current, fresh)) {
          console.debug(`[useSong] ${key}: свежая версия идентична показанной — применяем молча`);
          remember(fresh);
          return;
        }
        console.debug(`[useSong] ${key}: свежая версия отличается — предлагаем обновить`);
        pendingFresh.current = fresh;
        setFreshAvailable(true);
      },
    })
      .then(({ song: loaded, fromCache }) => {
        if (!active) return;
        console.debug(`[useSong] loaded song ${key}, источник:`, fromCache ? 'cache' : 'network');
        remember(loaded);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить песню');
        console.error('[useSong] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [key]);

  const applyFresh = useCallback(() => {
    const fresh = pendingFresh.current;
    if (!fresh) return;
    console.debug(`[useSong] applyFresh для ${String(fresh.id)}`);
    pendingFresh.current = null;
    setFreshAvailable(false);
    shown.current = fresh;
    setSong(fresh);
  }, []);

  return { song, loading, error, freshAvailable, applyFresh };
}

/**
 * Кладёт песню в память сессии — следующее открытие нарисует её синхронно. После записи
 * песни: иначе `seen` отдал бы старую версию до прихода фоновой ревалидации.
 */
export function rememberSong(song: Song): void {
  seen.set(String(song.id), song);
}
