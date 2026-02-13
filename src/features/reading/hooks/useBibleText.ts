import { useState, useEffect } from 'react';
import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';
import { getCachedText, setCachedText } from '../bible-text-cache';

export function useBibleText(reference: BibleReference | null) {
  const [text, setText] = useState<string>(() =>
    reference ? getCachedText(reference.book, reference.chapter) ?? '' : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setText('');
      setError(null);
      return;
    }

    const cached = getCachedText(reference.book, reference.chapter);
    if (cached !== undefined) {
      setText(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const loadText = async () => {
      setLoading(true);
      setError(null);
      setText('');

      try {
        const response = await bibleApi.getText(reference.book, reference.chapter);
        const result = response.text || '';
        setCachedText(reference.book, reference.chapter, result);
        setText(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Не удалось загрузить текст';
        setError(errorMessage);
        console.error('Error loading bible text:', err);
      } finally {
        setLoading(false);
      }
    };

    loadText();
  }, [reference?.book, reference?.chapter]);

  return { text, loading, error };
}

