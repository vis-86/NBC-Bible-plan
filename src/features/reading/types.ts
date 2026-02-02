import type { BibleTranslationId } from '@/lib/bible-translations';

export interface ReadingSettings {
  font_size: number;
  line_height: number;
  text_align: 'left' | 'center' | 'justify';
  theme: 'light' | 'dark' | 'sepia';
  verse_numbers_visible: boolean;
  ot_translation: BibleTranslationId;
  nt_translation: BibleTranslationId;
}

