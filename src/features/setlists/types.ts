/**
 * Доменные типы фичи «Сетлисты». Форма отвечает BFF-роутам
 * (`server/src/routes/setlists.ts`) — см. `.ai-factory/plans/feature-setlists.md`.
 */

/** Краткая карточка сета для списка/дашборда. */
export interface SetlistSummary {
  id: string;
  title: string;
  /** `null` — дата не задана («без даты», см. `partitionSetlists`). */
  date: string | null;
  itemCount: number;
}

export interface SetlistItem {
  id: string;
  sort: number;
  songId: number;
  title: string;
  subtitle?: string;
  songKey?: string;
}

/** Полный сет с составом (деталь). */
export interface Setlist {
  id: string;
  title: string;
  date: string | null;
  items: SetlistItem[];
}

export interface SetlistsListResponse {
  setlists: SetlistSummary[];
}

export interface SetlistResponse {
  setlist: Setlist;
}

export interface CreateSetlistPayload {
  title: string;
  date?: string | null;
  songIds: number[];
}

export interface UpdateSetlistPayload {
  title?: string;
  date?: string | null;
  songIds?: number[];
}
