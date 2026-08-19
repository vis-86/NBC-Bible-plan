import { useState, useEffect } from 'react';
import { readingSettingsApi } from '@/shared/services/api/endpoints';
import { readThroughSWR } from '@/shared/offline/readThrough';
import type { ReadingSettings } from '@/features/reading/types';
import { isBibleTranslationId } from '@/lib/bible-translations';

const READING_SETTINGS_CACHE_KEY = 'reading:settings';

function isTextAlign(value: unknown): value is ReadingSettings['text_align'] {
  return value === 'left' || value === 'center' || value === 'justify';
}

function isTheme(value: unknown): value is ReadingSettings['theme'] {
  return value === 'light' || value === 'dark' || value === 'sepia' || value === 'system';
}

const defaultSettings: ReadingSettings = {
  font_size: 20,
  line_height: 1.6,
  text_align: 'left',
  theme: 'system',
  verse_numbers_visible: true,
  ot_translation: 'rst',
  nt_translation: 'rst',
  verse_per_line: false
};

/**
 * Приводит серверный ответ к валидным настройкам. Вынесено из хука: одно и то же
 * приведение нужно и первичному чтению, и фоновой ревалидации (SWR).
 */
function normalizeSettings(
  raw: Record<string, unknown> | null | undefined,
  base: ReadingSettings
): ReadingSettings {
  if (!raw) return base;
  return {
    font_size: (raw.font_size as number | undefined) ?? base.font_size,
    line_height: (raw.line_height as number | undefined) ?? base.line_height,
    text_align: isTextAlign(raw.text_align) ? raw.text_align : base.text_align,
    theme: isTheme(raw.theme) ? raw.theme : base.theme,
    verse_numbers_visible: (raw.verse_numbers_visible as boolean | undefined) ?? base.verse_numbers_visible,
    ot_translation: isBibleTranslationId(raw.ot_translation) ? raw.ot_translation : base.ot_translation,
    nt_translation: isBibleTranslationId(raw.nt_translation) ? raw.nt_translation : base.nt_translation,
    verse_per_line:
      typeof raw.verse_per_line === 'boolean' ? raw.verse_per_line : base.verse_per_line,
  };
}

export function useReadingSettings() {
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoadError(null);
        // Cache-first. Свежие настройки применяются молча — конфликта с локальными
        // правками нет: сохранение сразу пишет и в сеть, и в кеш по тому же ключу.
        const { data: response } = await readThroughSWR(
          READING_SETTINGS_CACHE_KEY,
          () => readingSettingsApi.getSettings(),
          {
            onFresh: (fresh) => {
              if (!fresh.settings) return;
              console.debug('[useReadingSettings] применяем свежие настройки', READING_SETTINGS_CACHE_KEY);
              setSettings((prev) => normalizeSettings(fresh.settings, prev));
            },
          }
        );
        if (response.settings) {
          setSettings((prev) => normalizeSettings(response.settings, prev));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        setLoadError('Не удалось загрузить настройки чтения');
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const updateSettings = async (newSettings: ReadingSettings) => {
    if (loading) return;
    setLoading(true);
    try {
      await readingSettingsApi.updateSettings(newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    updateSettings,
    loading,
    isLoading,
    loadError
  };
}

