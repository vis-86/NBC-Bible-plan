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

/**
 * Initializes mock Telegram WebApp for development
 */
export const initDevTelegramWebApp = () => {
  if (typeof window !== 'undefined' && !window.Telegram?.WebApp?.initData) {
    // Mock Telegram WebApp for development
    // Используем актуальную дату для auth_date
    const authDate = Math.floor(Date.now() / 1000);
    const userData = {
      id: 12345678,
      first_name: 'Иван',
      last_name: 'Тестовый',
      username: 'test_user',
      language_code: 'ru'
    };
    
    // Создаем мок initData с актуальной датой
    const userJson = encodeURIComponent(JSON.stringify(userData));
    const mockInitData = `user=${userJson}&auth_date=${authDate}&hash=dev_mock_hash`;
    
    window.Telegram = {
      WebApp: {
        initData: mockInitData,
        initDataUnsafe: {
          user: userData,
          auth_date: authDate.toString(),
          hash: 'dev_mock_hash'
        },
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
      }
    };
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

/**
 * Initializes the WebApp (tells Telegram the app is ready)
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
    // Set theme colors if needed
    webApp.setHeaderColor('#ffffff');
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
 * Returns true if the app is running as a Telegram Mini App
 */
export const isTelegramWebApp = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  
  return !!window.Telegram?.WebApp;
};
