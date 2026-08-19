'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readSetlistsThroughSWR, refreshSetlistsFromNetwork } from '../lib/offlineSetlists';
import type { SetlistSummary } from '../types';

/** Module-level кэш: список сетов грузится один раз за сессию (по образцу `useSongs`). */
let cache: SetlistSummary[] | null = null;
let inflight: Promise<SetlistSummary[]> | null = null;

/**
 * Поколение кэша. Чтение стало cache-first: помимо `inflight` в воздухе может висеть
 * фоновая ревалидация SWR, и её поздний ответ обязан быть отброшен после сброса кэша —
 * иначе экран показал бы состав, которого уже нет.
 */
let generation = 0;

/** Подписчики на молчаливое применение свежего списка (фоновая ревалидация). */
const listeners = new Set<(list: SetlistSummary[]) => void>();

/**
 * Сбрасывает module-кэш списка — вызывать после ЛЮБОЙ мутации сета (создание, правка
 * состава, удаление). Без этого экран списка после возврата рендерит состав, которого
 * уже нет: apiCache в IDB инвалидируется, а память процесса — нет. Вместе с кэшем
 * гасится и SWR-состояние: незавершённые чтение и ревалидация этого поколения.
 */
export function resetSetlistsCache(): void {
  cache = null;
  inflight = null;
  generation += 1;
  console.debug('[useSetlists] module cache reset', { generation });
}

async function fetchSetlistsOnce(): Promise<SetlistSummary[]> {
  if (cache) return cache;
  if (!inflight) {
    const gen = generation;
    inflight = readSetlistsThroughSWR({
      onFresh: (list) => {
        if (gen !== generation) {
          console.debug('[useSetlists] свежий список отброшен: кэш сброшен во время ревалидации');
          return;
        }
        cache = list;
        listeners.forEach((notify) => notify(list));
      },
    })
      .then(({ setlists, fromCache }) => {
        console.debug('[useSetlists] источник данных:', fromCache ? 'cache' : 'network');
        if (gen === generation) cache = setlists;
        return setlists;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useSetlists() {
  const [setlists, setSetlists] = useState<SetlistSummary[]>(() => cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const activeRef = useRef(true);
  const refreshingRef = useRef(false);
  /**
   * Ручное обновление уже отдало данные — стартовое чтение опоздало и его результат
   * (как и его ошибка) больше не истина: теперь эти два запроса могут идти
   * параллельно, и без флага поздний ответ затирал бы свежий список.
   */
  const refreshWonRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  /**
   * Ручное обновление списка (pull-to-refresh). Всегда резолвится: вызывающий жест
   * ждёт промис, чтобы остановить спиннер, и не должен ловить исключение.
   */
  const refresh = useCallback(async () => {
    // Дедуп только с ДРУГИМ ручным обновлением: там спиннер уже крутится и результат
    // придёт. Пропускать жест из-за стартового readSetlistsThrough нельзя — он
    // завершался молча: ни новых данных, ни ошибки (офлайн-жест не давал «Нет сети»).
    // Лишний запрос в этой гонке дешевле немого жеста.
    if (refreshingRef.current) {
      console.debug('[useSetlists] refresh: skipped (already in flight)');
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);
    console.debug('[useSetlists] refresh: start');

    try {
      const list = await refreshSetlistsFromNetwork();
      // Обновляем module-кэш, а не сбрасываем: reset заставил бы следующий монтаж
      // экрана снова идти в сеть, хотя свежие данные уже на руках.
      cache = list;
      refreshWonRef.current = true;
      if (activeRef.current) {
        setSetlists(list);
        setRefreshError(null);
        setError(null);
      }
      console.debug(`[useSetlists] refresh: ok ${list.length} setlist(s)`);
    } catch (err) {
      // Список на экране валиден — не трогаем его, показываем только сообщение.
      if (activeRef.current) {
        setRefreshError(err instanceof Error ? err.message : 'Не удалось обновить список');
      }
      console.warn('[useSetlists] refresh: failed', err);
    } finally {
      refreshingRef.current = false;
      if (activeRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const notify = (list: SetlistSummary[]) => {
      if (active && !refreshWonRef.current) setSetlists(list);
    };
    listeners.add(notify);

    fetchSetlistsOnce()
      .then((list) => {
        if (!active || refreshWonRef.current) return;
        setSetlists(list);
        console.debug(`[useSetlists] loaded ${list.length} setlist(s)`);
      })
      .catch((err) => {
        if (!active || refreshWonRef.current) return;
        setError(err instanceof Error ? err.message : 'Не удалось загрузить сеты');
        console.error('[useSetlists] load error:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      listeners.delete(notify);
    };
  }, []);

  return { setlists, loading, error, refresh, refreshing, refreshError };
}
