import { apiClient, ApiClientError } from './client';
import { getApiPath } from '@/shared/utils/api';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import type { AppRole } from '@/lib/app-roles';
// Type-only import (стирается при компиляции) — доменные типы фичи songs.
import type {
  CatalogSong,
  CreateSongPayload,
  SongListResponse,
  SongResponse,
  UpdateSongPayload,
} from '@/features/songs/types';
import type {
  CreateSetlistPayload,
  SetlistResponse,
  SetlistsListResponse,
  UpdateSetlistPayload,
} from '@/features/setlists/types';

// Types for API responses
export interface PlanResponse {
  plan: any[];
}

export interface WeeklyPlanItem {
  id: string;
  numbers: number;
  item: number;
  read: string;
}

export interface WeeklyPlanWeek {
  week: number;
  items: WeeklyPlanItem[];
}

export interface WeeklyPlanResponse {
  book: string;
  weeks: WeeklyPlanWeek[];
}

export interface ProgressResponse {
  progress: Array<{
    id: number;
    day: number;
    count: number | null;
  }>;
}

export interface ReadingSettingsResponse {
  settings: {
    font_size: number;
    line_height: number;
    text_align: string;
    theme: string;
    verse_numbers_visible: boolean;
    ot_translation?: string;
    nt_translation?: string;
    verse_per_line?: boolean;
  };
}

export interface BibleTextResponse {
  text: string;
  /** Перевод, фактически отдавший текст (может отличаться от запрошенного — фолбэк на 'rst' для неполных датасетов). */
  translation?: string;
}

export type AppThemePreference = 'light' | 'dark' | 'system';

export interface AppSettingsResponse {
  settings: {
    theme: AppThemePreference;
  };
}

// API Endpoints
export const planApi = {
  getPlan: async (): Promise<PlanResponse> => {
    return apiClient.get<PlanResponse>('/api/plan');
  },
};

export const weeklyPlanApi = {
  getWeeklyPlan: async (book: string = 'proverbs'): Promise<WeeklyPlanResponse> => {
    const qs = new URLSearchParams({ book });
    return apiClient.get<WeeklyPlanResponse>(`/api/plan/weekly?${qs.toString()}`);
  },
};

export const progressApi = {
  getProgress: async (): Promise<ProgressResponse> => {
    return apiClient.get<ProgressResponse>('/api/user/progress');
  },
  
  updateProgress: async (day: number, count: number | null): Promise<void> => {
    return apiClient.post('/api/user/progress', { day, count });
  },
};

export const readingSettingsApi = {
  getSettings: async (): Promise<ReadingSettingsResponse> => {
    return apiClient.get<ReadingSettingsResponse>('/api/user/reading-settings');
  },
  
  updateSettings: async (settings: ReadingSettingsResponse['settings']): Promise<void> => {
    return apiClient.post('/api/user/reading-settings', settings);
  },
};

export const bibleApi = {
  getText: async (book: string, chapter: number): Promise<BibleTextResponse> => {
    const encodedBook = encodeURIComponent(book);
    return apiClient.get<BibleTextResponse>(`/api/bible/${encodedBook}/${chapter}`);
  },
};

export const songsApi = {
  getSongs: async (): Promise<SongListResponse> => {
    return apiClient.get<SongListResponse>('/api/songs');
  },
  getSong: async (id: string | number): Promise<SongResponse> => {
    return apiClient.get<SongResponse>(`/api/songs/${id}`);
  },
  /**
   * Песня по публичной ссылке — без сессии. skipAuth: страница гостя не должна
   * уводить на логин, закрытая песня приходит 404, а не 401.
   */
  getPublicSong: async (id: string | number): Promise<SongResponse> => {
    return apiClient.get<SongResponse>(`/api/public/songs/${id}`, { skipAuth: true });
  },
  create: async (payload: CreateSongPayload): Promise<{ id: number }> => {
    return apiClient.post<{ id: number }>('/api/songs', payload);
  },
  update: async (id: string | number, patch: UpdateSongPayload): Promise<void> => {
    await apiClient.put(`/api/songs/${id}`, patch);
  },
};

export interface CatalogCopyResult {
  /** 201 — песня скопирована; 409 — копия уже есть, `id` указывает на неё. */
  alreadyCopied: boolean;
  id: string;
}

export const catalogApi = {
  list: async (): Promise<{ songs: CatalogSong[] }> => {
    return apiClient.get<{ songs: CatalogSong[] }>('/api/catalog');
  },
  /**
   * 409 несёт в теле id уже существующей копии — штатный исход, а не ошибка, поэтому
   * `apiClient` (он теряет тело ошибки) здесь не используется.
   */
  copy: async (id: string | number): Promise<CatalogCopyResult> => {
    const res = await fetch(getApiPath(`/api/catalog/${encodeURIComponent(String(id))}/copy`), {
      method: 'POST',
      credentials: 'include',
    });
    if (res.status === 201 || res.status === 409) {
      const body = (await res.json().catch(() => null)) as { id?: number | string } | null;
      if (body?.id === undefined || body.id === null) throw new ApiClientError('Failed to parse response', res.status);
      return { alreadyCopied: res.status === 409, id: String(body.id) };
    }
    if (res.status === 401) {
      (globalThis as unknown as { __onSessionExpired?: () => void }).__onSessionExpired?.();
    }
    throw new ApiClientError(`HTTP error: ${res.statusText}`, res.status);
  },
};

export interface UserRoleResponse {
  role: AppRole;
}

export interface UpdateProfileResponse {
  success: true;
  user: { directus_id: string; first_name: string };
}

export const userApi = {
  getRole: async (): Promise<UserRoleResponse> => {
    return apiClient.get<UserRoleResponse>('/api/user/role');
  },
  /**
   * Смена отображаемого имени. Online-only (см. `docs/offline-pwa.md`): read-through
   * здесь неприменим — это запись, а не чтение. Ошибка приходит как `ApiClientError`
   * с серверным текстом в теле; вызывающий обязан показать его пользователю.
   */
  updateProfile: async (displayName: string): Promise<UpdateProfileResponse> => {
    console.debug('[userApi.updateProfile] request', { len: displayName.length });
    return apiClient.post<UpdateProfileResponse>('/api/user/profile', {
      display_name: displayName,
    });
  },
};

export const setlistsApi = {
  getSetlists: async (): Promise<SetlistsListResponse> => {
    return apiClient.get<SetlistsListResponse>('/api/setlists');
  },
  getSetlist: async (id: string): Promise<SetlistResponse> => {
    return apiClient.get<SetlistResponse>(`/api/setlists/${id}`);
  },
  create: async (payload: CreateSetlistPayload): Promise<{ id: string }> => {
    return apiClient.post<{ id: string }>('/api/setlists', payload);
  },
  update: async (id: string, payload: UpdateSetlistPayload): Promise<void> => {
    return apiClient.patch(`/api/setlists/${id}`, payload);
  },
  remove: async (id: string): Promise<void> => {
    return apiClient.delete(`/api/setlists/${id}`);
  },
};

export const appSettingsApi = {
  getSettings: async (): Promise<AppSettingsResponse> => {
    // Bootstrap темы выполняется на каждой странице (ThemeProvider), включая публичные
    // (/activate, /login). skipAuth — чтобы 401 без сессии не редиректил на /login.
    return apiClient.get<AppSettingsResponse>('/api/user/app-settings', { skipAuth: true });
  },
  updateSettings: async (settings: { theme: AppThemePreference }): Promise<void> => {
    return apiClient.post('/api/user/app-settings', settings);
  },
};


/** Пер-элементные версии офлайн-ресурсов (`GET /api/sync/manifest`). */
export interface SyncManifest {
  /** `[songId, version]`; ПОЛНЫЙ список опубликованных песен — отсутствие id = удалена. */
  songs: Array<[string, string]>;
  /** `[setlistId, version]`; версия учитывает и состав сета, не только `date_updated`. */
  setlists: Array<[string, string]>;
  plan: string;
}

export type SyncManifestResult =
  | { status: 'not-modified' }
  | { status: 'ok'; manifest: SyncManifest; etag: string | null };

export const syncApi = {
  /**
   * Читает манифест с условным запросом. `apiClient` здесь не подходит: он трактует
   * любой не-`ok` статус как ошибку, а 304 — штатный и самый частый ответ.
   */
  getManifest: async (etag?: string | null): Promise<SyncManifestResult> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (etag) headers['If-None-Match'] = etag;
    console.debug('[syncApi] getManifest, If-None-Match:', etag ?? '—');

    const response = await fetch(getApiPath('/api/sync/manifest'), {
      method: 'GET',
      headers,
      credentials: 'include',
      // Валидацию делает сервер (ETag). HTTP-кеш браузера тут только мешал бы.
      cache: 'no-cache',
    });

    console.debug('[syncApi] getManifest status:', response.status);
    if (response.status === 304) return { status: 'not-modified' };
    if (!response.ok) {
      throw new ApiClientError(`Sync manifest error: ${response.status}`, response.status);
    }

    const manifest = (await response.json()) as SyncManifest;
    return { status: 'ok', manifest, etag: response.headers.get('ETag') };
  },
};
