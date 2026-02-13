'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import { appSettingsApi, type AppThemePreference } from '@/shared/services/api/endpoints';
import { getSystemTheme, subscribeToSystemTheme, type SystemTheme } from '@/shared/utils/theme';
import { isTelegramWebApp, setHeaderColorFromAppTheme } from '@/lib/telegram';

type EffectiveTheme = 'light' | 'dark';

interface ThemeContextType {
  themePreference: AppThemePreference;
  setThemePreference: (theme: AppThemePreference) => void;
  effectiveTheme: EffectiveTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  const [themePreference, setThemePreferenceState] = useState<AppThemePreference>('system');
  const [systemTheme, setSystemTheme] = useState<SystemTheme>(() =>
    typeof window !== 'undefined' ? getSystemTheme() : 'light'
  );
  const [loaded, setLoaded] = useState(false);

  const effectiveTheme: EffectiveTheme = useMemo(
    () => (themePreference === 'system' ? systemTheme : themePreference),
    [themePreference, systemTheme]
  );

  useEffect(() => {
    setSystemTheme(getSystemTheme());
    const unsub = subscribeToSystemTheme(setSystemTheme);
    return unsub;
  }, []);

  useEffect(() => {
    appSettingsApi
      .getSettings()
      .then((res) => {
        const t = res.settings?.theme;
        if (t === 'light' || t === 'dark' || t === 'system') {
          setThemePreferenceState(t);
        }
      })
      .catch(() => {
        // 401 or network: keep default 'system'
      })
      .finally(() => setLoaded(true));
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }, [effectiveTheme]);

  // Цвет хедера Mini App — по теме из настроек
  useEffect(() => {
    if (isTelegramWebApp()) {
      setHeaderColorFromAppTheme(effectiveTheme);
    }
  }, [effectiveTheme]);

  const setThemePreference = useCallback(async (theme: AppThemePreference) => {
    setThemePreferenceState(theme);
    try {
      await appSettingsApi.updateSettings({ theme });
    } catch {
      // persist on next settings open or ignore
    }
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({
      themePreference,
      setThemePreference,
      effectiveTheme,
    }),
    [themePreference, setThemePreference, effectiveTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
