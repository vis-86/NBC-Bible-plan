/**
 * Utility for interacting with Telegram WebApp SDK
 */

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

/** Theme colors from Telegram (optional fields) */
interface TelegramThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: string;
    hash?: string;
  };
  /** Current color scheme in Telegram: "light" or "dark" */
  colorScheme?: 'light' | 'dark';
  /** Current theme colors from Telegram */
  themeParams?: TelegramThemeParams;
  /** Subscribe to theme changes (e.g. user switches Day/Night in Telegram) */
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
  ready: () => void;
  close: () => void;
  expand: () => void;
  enableClosingConfirmation: () => void;
  disableVerticalSwipes: () => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
  };
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

/** Цвета темы для мока — из Tailwind/globals.css */
const DEV_THEME_PARAMS: Record<'light' | 'dark', TelegramThemeParams> = {
  light: { bg_color: '#ffffff', secondary_bg_color: '#f4f4f5' },
  dark: { bg_color: '#0a0a0a', secondary_bg_color: '#171717' },
};

/** Тема приложения: data-theme на documentElement или prefers-color-scheme */
function getDevTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  const dataTheme = document.documentElement.getAttribute('data-theme');
  if (dataTheme === 'dark' || dataTheme === 'light') return dataTheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Initializes mock Telegram WebApp for development.
 * colorScheme и themeParams синхронизированы с темой приложения (data-theme / system).
 */
export const initDevTelegramWebApp = () => {
  if (typeof window !== 'undefined' && !window.Telegram?.WebApp?.initData) {
    const authDate = Math.floor(Date.now() / 1000);
    const userData = {
      id: 12345678,
      first_name: 'Иван',
      last_name: 'Тестовый',
      username: 'test_user',
      language_code: 'ru'
    };
    const userJson = encodeURIComponent(JSON.stringify(userData));
    const mockInitData = `user=${userJson}&auth_date=${authDate}&hash=dev_mock_hash`;

    const themeChangedListeners: (() => void)[] = [];
    const onEvent = (eventType: string, callback: () => void) => {
      if (eventType === 'themeChanged') themeChangedListeners.push(callback);
    };
    const offEvent = (eventType: string, callback: () => void) => {
      if (eventType === 'themeChanged') {
        const i = themeChangedListeners.indexOf(callback);
        if (i >= 0) themeChangedListeners.splice(i, 1);
      }
    };

    const webApp: TelegramWebApp = {
      initData: mockInitData,
      initDataUnsafe: {
        user: userData,
        auth_date: authDate.toString(),
        hash: 'dev_mock_hash'
      },
      onEvent,
      offEvent,
      ready: () => {},
      close: () => {},
      expand: () => {},
      enableClosingConfirmation: () => {
        console.log('[Dev] Closing confirmation enabled');
      },
      disableVerticalSwipes: () => {
        console.log('[Dev] Vertical swipes disabled');
      },
      MainButton: {
        text: '',
        color: '',
        textColor: '',
        isVisible: false,
        isActive: false,
        show: () => {},
        hide: () => {},
        onClick: () => {},
      },
      setHeaderColor: () => {},
      setBackgroundColor: () => {},
    };

    Object.defineProperty(webApp, 'colorScheme', {
      get: () => getDevTheme(),
      enumerable: true,
    });
    Object.defineProperty(webApp, 'themeParams', {
      get: () => DEV_THEME_PARAMS[getDevTheme()],
      enumerable: true,
    });

    // При смене data-theme в приложении вызываем themeChanged
    const observer = new MutationObserver(() => {
      themeChangedListeners.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.Telegram = { WebApp: webApp };
  }
};

/**
 * Returns the Telegram WebApp object if available
 */
export const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  if (window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return undefined;
};

/**
 * Returns information about the current Telegram user
 */
export const getTelegramUser = (): TelegramUser | undefined => {
  const webApp = getTelegramWebApp();
  return webApp?.initDataUnsafe?.user;
};

/** Цвета хедера под тему приложения (из настроек) — из Tailwind/globals.css */
const APP_THEME_HEADER_COLORS: Record<'light' | 'dark', string> = {
  light: '#ffffff',
  dark: '#1b1917', // --background в [data-theme="dark"]
};

/**
 * Устанавливает цвет хедера Mini App по теме из настроек приложения (light/dark).
 * Вызывать из ThemeProvider при смене effectiveTheme.
 */
export const setHeaderColorFromAppTheme = (theme: 'light' | 'dark') => {
  const webApp = getTelegramWebApp();
  if (!webApp?.setHeaderColor) return;
  webApp.setHeaderColor(APP_THEME_HEADER_COLORS[theme]);
};

/**
 * Initializes the WebApp (tells Telegram the app is ready).
 * Expands to full height. Цвет хедера задаётся из настроек в ThemeProvider.
 */
export const initTelegramWebApp = () => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.ready();
    webApp.expand();
    // Disable vertical swipes to prevent accidental swipe-to-close
    webApp.disableVerticalSwipes();
    // Enable closing confirmation dialog
    webApp.enableClosingConfirmation();
  }
};

/**
 * Sets up additional protection against accidental app closure
 * Should be called early in the app lifecycle
 */
export const setupTelegramAppProtection = () => {
  if (typeof window === 'undefined') return;

  // Apply protection immediately when Telegram WebApp is available
  const applyProtection = () => {
    const webApp = getTelegramWebApp();
    if (webApp) {
      try {
        webApp.disableVerticalSwipes();
        webApp.enableClosingConfirmation();
      } catch (error) {
        console.warn('Failed to apply Telegram app protection:', error);
      }
    }
  };

  // Try to apply immediately
  applyProtection();

  // Also try when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyProtection);
  }

  // Listen for Telegram WebApp initialization
  if (window.Telegram?.WebApp) {
    applyProtection();
  } else {
    // Poll for Telegram WebApp availability (in case script loads later)
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.Telegram?.WebApp || attempts > 20) {
        clearInterval(checkInterval);
        if (window.Telegram?.WebApp) {
          applyProtection();
        }
      }
    }, 100);
  }
};

/**
 * Returns the raw initData string
 */
export const getTelegramInitData = (): string | undefined => {
  return getTelegramWebApp()?.initData;
};

/**
 * Returns true if the Telegram WebApp script has loaded and the WebApp object exists.
 * True in both Telegram client and in browser (script loads in both); use isTelegramWebApp() for "has initData".
 */
export const hasTelegramWebAppObject = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!window.Telegram?.WebApp;
};

/**
 * Returns true if the app is running as a Telegram Mini App with valid initData (real Telegram context).
 */
export const isTelegramWebApp = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return !!window.Telegram?.WebApp?.initData;
};
