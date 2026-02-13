/**
 * Схема типов для Directus коллекций
 */
export interface DirectusSchema {
  telegram_user_mapping: {
    id: number;
    directus_user_id: string;
    telegram_user_id: number;
  };
  reading: {
    id: number;
    user_id: number;
    day: number;
    directus_user_id?: string | null;
    count: number | null;
    completed_items?: number[] | null;
    year?: number | null;
  };
  plan: {
    id: number;
    numbers: number;
    read: string;
    item: number;
  };
  reading_settings: {
    id: number;
    directus_user_id: string;
    font_size?: number;
    line_height?: number;
    text_align?: string;
    theme?: string;
    verse_numbers_visible?: boolean;
  };
  chat_history: {
    id: number;
    directus_user_id: string;
    pastor_id: string;
    messages: Array<{
      id: string;
      role: 'user' | 'model';
      text: string;
      timestamp: number;
    }>;
    created_at?: string;
    updated_at?: string;
  };
  user_app_settings: {
    id: string;
    directus_user_id: string;
    theme: 'light' | 'dark' | 'system';
  };
}

