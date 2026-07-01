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
  /**
   * Stateful invite/reset токены. Админ генерит запись в Directus UI (Flow заполняет
   * token/expires_at/invite_url) ИЛИ программно через createInvite. Одноразовость = used_at,
   * TTL = expires_at самой записи.
   */
  /**
   * Каталог песен (ChordPro). `content` — сырой ChordPro; метаданные вынесены
   * в поля для списка/поиска. Коллекция создаётся bootstrap-скриптом
   * (scripts/songs-import/bootstrap.ts), наполняется import-скриптом (#62).
   * ВНИМАНИЕ: поле называется `song_key` (не `key`), т.к. `key` — зарезервировано.
   */
  songs: {
    id: number;
    title: string;
    subtitle?: string | null;
    /** Тональность (директива {key}). */
    song_key?: string | null;
    tempo?: number | null;
    time?: string | null;
    /** Сырой ChordPro-контент. */
    content: string;
    /** Стабильный slug из имени файла (уникальный). */
    slug: string;
    status?: string;
    sort?: number | null;
    date_created?: string;
    date_updated?: string;
  };
  auth_invites: {
    id: number;
    /** секрет ссылки (unique) */
    token: string;
    kind: 'activate' | 'reset';
    /** reset: цель; activate: заполняется после активации; иначе null */
    user?: string | null;
    /** «для кого» (новый юзер, аккаунта ещё нет) */
    label?: string | null;
    /** TTL */
    expires_at: string;
    /** одноразовость: проставляется при использовании */
    used_at?: string | null;
    /** готовая ссылка активации/сброса */
    invite_url?: string | null;
  };
}

