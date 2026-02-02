import { useState, useEffect } from 'react';
import { BibleReference } from '@/types';
import { bibleApi } from '@/shared/services/api/endpoints';

export function useBibleText(reference: BibleReference | null) {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setText('');
      return;
    }

    const loadText = async () => {
      setLoading(true);
      setError(null);
      setText('');
      
      try {
        const response = await bibleApi.getText(reference.book, reference.chapter);
        setText(response.text || '');
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

