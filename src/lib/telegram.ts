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

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: string;
    hash?: string;
  };
  ready: () => void;
  close: () => void;
  expand: () => void;
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

/**
 * Returns the Telegram WebApp object if available
 */
export const getTelegramWebApp = (): TelegramWebApp | undefined => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
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

/**
 * Initializes the WebApp (tells Telegram the app is ready)
 */
export const initTelegramWebApp = () => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.ready();
    webApp.expand();
    // Set theme colors if needed
    webApp.setHeaderColor('#ffffff');
  }
};

/**
 * Returns the raw initData string
 */
export const getTelegramInitData = (): string | undefined => {
  return getTelegramWebApp()?.initData;
};

/**
 * Returns true if the app is running as a Telegram Mini App
 */
export const isTelegramWebApp = (): boolean => {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp?.initData;
};
