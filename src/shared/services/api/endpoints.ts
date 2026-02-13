import { apiClient } from './client';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';

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
  };
}

export interface BibleTextResponse {
  text: string;
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

export const appSettingsApi = {
  getSettings: async (): Promise<AppSettingsResponse> => {
    return apiClient.get<AppSettingsResponse>('/api/user/app-settings');
  },
  updateSettings: async (settings: { theme: AppThemePreference }): Promise<void> => {
    return apiClient.post('/api/user/app-settings', settings);
  },
};

