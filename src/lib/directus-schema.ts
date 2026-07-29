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
    /** Исходная тональность (директива {key}) — в ней записаны аккорды в content. */
    song_key?: string | null;
    /** Основная тональность: в ней команда обычно играет. Пусто ⇒ действует song_key. */
    default_key?: string | null;
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
  /**
   * Личное состояние песни у пользователя (M10 + §10.3): рабочая тональность,
   * скорость автоскролла и рукописные пометки. Строго личная запись —
   * `user_id` берётся ТОЛЬКО из iron-session, никогда из тела запроса.
   *
   * Уникальность пары `(user_id, song)` держится детерминированным `id`
   * (UUIDv5, см. `src/features/songs/services/songStateServer.ts`), а не составным
   * индексом: Directus REST не умеет составные индексы.
   */
  song_user_state: {
    /** UUIDv5 от `"{user_id}:{song}"` — дубликат невозможен по построению. */
    id: string;
    user_id: string;
    song: number;
    /** Рабочая тональность музыканта (уровень 3, §10.1). */
    key?: string | null;
    /** Рукописные пометки: `SongAnnotations['strokes']`. */
    strokes?: unknown[] | null;
    scroll_speed?: number | null;
    /**
     * LWW-метка. Пишет ПРИЛОЖЕНИЕ (время правки на устройстве), а не Directus:
     * серверная метка сломала бы LWW — отложенный replay старой офлайн-правки
     * получил бы свежее время и затёр более новую правку с другого устройства.
     */
    updated_at?: string | null;
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

