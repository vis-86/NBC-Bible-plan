import { useState, useEffect } from 'react';
import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import { getCachedText, setCachedText, getPersistedText, persistText } from '../bible-text-cache';
import { OfflineNoDataError, isDefinitelyOffline, raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';

const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[useBibleText]', ...args);
}

/** Соседние главы КНИГИ (без учёта плана — свайп внутри дня может уводить в другую
 * книгу, но у этого хука нет доступа к day.items; прогрев best-effort по границам книги). */
function neighborChapters(book: string, chapter: number): number[] {
  const bookInfo = BIBLE_STRUCTURE.find(b => b.name === book);
  const maxChapters = bookInfo?.chapters ?? chapter;
  const neighbors: number[] = [];
  if (chapter > 1) neighbors.push(chapter - 1);
  if (chapter < maxChapters) neighbors.push(chapter + 1);
  return neighbors;
}

/**
 * Прогрев одной соседней главы. Best-effort: ошибка/таймаут проглатываются,
 * никогда не влияет на текущий экран. Не ретраится — раз не получилось, ждём
 * следующего свайпа (см. НЕ делай в задаче 10).
 */
function prefetchChapter(book: string, chapter: number, translationId: string): void {
  if (getCachedText(book, chapter, translationId) !== undefined) {
    debug('prefetch', { book, chapter, skipped: 'cached' });
    return;
  }
  if (isDefinitelyOffline()) {
    debug('prefetch', { book, chapter, skipped: 'offline' });
    return;
  }
  debug('prefetch', { book, chapter, skipped: false });
  const run = async () => {
    const response = await raceNetwork(bibleApi.getText(book, chapter), DEFAULT_NETWORK_TIMEOUT_MS);
    const resultText = response.text || '';
    const resolvedTranslationId = response.translation ?? translationId;
    setCachedText(book, chapter, resolvedTranslationId, resultText);
    void persistText(resolvedTranslationId, book, chapter, resultText);
  };
  run().catch(() => {});
}

/**
 * @param translationId — перевод для текущей книги (`ot_translation` или `nt_translation`), как на сервере.
 */
export function useBibleText(reference: BibleReference | null, translationId: string) {
  const [text, setText] = useState<string>(() =>
    reference ? getCachedText(reference.book, reference.chapter, translationId) ?? '' : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setText('');
      setError(null);
      return;
    }

    const cached = getCachedText(reference.book, reference.chapter, translationId);
    if (cached !== undefined) {
      debug('memory cache hit', { book: reference.book, chapter: reference.chapter, translationId });
      setText(cached);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadText = async () => {
      setLoading(true);
      setError(null);
      setText('');

      try {
        // Race с таймаутом: реальный «офлайн» вешает fetch, а не роняет его — без
        // таймаута IDB-фолбэк скачанной главы никогда не наступал (see networkTimeout.ts).
        const network = bibleApi.getText(reference.book, reference.chapter);
        network.catch(() => {}); // поздний reject после ухода в фолбэк — не unhandled

        let response: Awaited<typeof network>;
        try {
          response = await raceNetwork(network, DEFAULT_NETWORK_TIMEOUT_MS);
        } catch (raceErr) {
          if (!isNetworkTimeout(raceErr)) throw raceErr;
          const persisted = await getPersistedText(reference.book, reference.chapter, translationId);
          if (persisted !== undefined) {
            console.debug('[FIX][useBibleText] network timed out, served chapter from IDB', reference.book, reference.chapter);
            if (cancelled) return;
            setCachedText(reference.book, reference.chapter, translationId, persisted);
            setText(persisted);
            setError(null);
            return;
          }
          // Фолбэка нет — дожидаемся медленную сеть (лучше долгая загрузка, чем ошибка).
          // Но если сети заведомо нет, ждать нечего: внешний catch покажет текст ошибки.
          if (isDefinitelyOffline()) throw new OfflineNoDataError();
          response = await network;
        }
        const result = response.text || '';
        const resolvedTranslationId = response.translation ?? translationId;
        if (resolvedTranslationId !== translationId) {
          // Отравление кеша: сервер резолвит перевод иначе, чем ждёт клиент (например,
          // поле перевода не сохранилось в Directus) — не кешируем под запрошенным
          // ключом, иначе следующий рендер этой же главы отдаст чужой текст навсегда.
          console.warn('[useBibleText] translation mismatch: requested=%s got=%s', translationId, resolvedTranslationId, {
            book: reference.book,
            chapter: reference.chapter,
          });
        }
        // Ключуем И memory-кеш, И IDB-запись по переводу из ОТВЕТА сервера, не по
        // translationId клиента — сессия может резолвить перевод иначе (Task 22).
        setCachedText(reference.book, reference.chapter, resolvedTranslationId, result);
        void persistText(resolvedTranslationId, reference.book, reference.chapter, result);
        if (!cancelled) setText(result);
      } catch (err) {
        // Сеть недоступна (или ответ не пришёл) — пробуем офлайн-фолбэк из IDB, прежде
        // чем показывать ошибку.
        const fallback = await getPersistedText(reference.book, reference.chapter, translationId);
        if (cancelled) return;

        if (fallback !== undefined) {
          setCachedText(reference.book, reference.chapter, translationId, fallback);
          setText(fallback);
          setError(null);
        } else {
          const errorMessage = err instanceof Error ? err.message : 'Не удалось загрузить текст';
          setError(errorMessage);
          console.error('Error loading bible text:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadText();

    return () => {
      cancelled = true;
    };
  }, [reference?.book, reference?.chapter, translationId]);

  // Прогрев соседних глав после успешной загрузки текущей — делает переход по
  // свайпу мгновенным. Гейт по `text`, а не только `!loading`: `loading`
  // инициализируется `false` и на первом рендере ещё не отражает реальный статус.
  useEffect(() => {
    if (!reference || loading || error || !text) return;
    neighborChapters(reference.book, reference.chapter).forEach(chapter =>
      prefetchChapter(reference.book, chapter, translationId)
    );
  }, [reference?.book, reference?.chapter, translationId, loading, error, text]);

  return { text, loading, error };
}

