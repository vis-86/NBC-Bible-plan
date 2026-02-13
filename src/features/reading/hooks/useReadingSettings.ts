import { useState, useEffect } from 'react';
import { readingSettingsApi } from '@/shared/services/api/endpoints';
import type { ReadingSettings } from '@/features/reading/types';
import { isBibleTranslationId } from '@/lib/bible-translations';

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
  nt_translation: 'rst'
};

export function useReadingSettings() {
  const [settings, setSettings] = useState<ReadingSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await readingSettingsApi.getSettings();
        if (response.settings) {
          setSettings({
            font_size: response.settings.font_size ?? defaultSettings.font_size,
            line_height: response.settings.line_height ?? defaultSettings.line_height,
            text_align: isTextAlign(response.settings.text_align)
              ? response.settings.text_align
              : defaultSettings.text_align,
            theme: isTheme(response.settings.theme) ? response.settings.theme : defaultSettings.theme,
            verse_numbers_visible: response.settings.verse_numbers_visible ?? defaultSettings.verse_numbers_visible,
            ot_translation: isBibleTranslationId(response.settings.ot_translation)
              ? response.settings.ot_translation
              : defaultSettings.ot_translation,
            nt_translation: isBibleTranslationId(response.settings.nt_translation)
              ? response.settings.nt_translation
              : defaultSettings.nt_translation
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
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
    isLoading
  };
}

