import { useState, useEffect } from 'react';
import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';
import { getCachedText, setCachedText, getPersistedText, persistText } from '../bible-text-cache';
import { OfflineNoDataError, isDefinitelyOffline, raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';

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
        setCachedText(reference.book, reference.chapter, translationId, result);
        // Ключуем IDB-запись по переводу из ОТВЕТА сервера, не по translationId клиента —
        // сессия может резолвить перевод иначе (Task 22).
        void persistText(response.translation ?? translationId, reference.book, reference.chapter, result);
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

  return { text, loading, error };
}

