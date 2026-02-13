/**
 * App theme utilities: system theme detection (browser or Telegram Mini App)
 * and subscription to theme changes.
 */

export type SystemTheme = 'light' | 'dark';

/**
 * Returns current system theme: from Telegram WebApp if available, otherwise from prefers-color-scheme.
 */
export function getSystemTheme(): SystemTheme {
  if (typeof window === 'undefined') return 'light';

  const tg = window.Telegram?.WebApp;
  if (tg?.colorScheme === 'dark' || tg?.colorScheme === 'light') {
    return tg.colorScheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Subscribes to system theme changes (browser media query and/or Telegram themeChanged).
 * Returns unsubscribe function.
 */
export function subscribeToSystemTheme(callback: (theme: SystemTheme) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const notify = () => callback(getSystemTheme());

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', notify);

  const tg = window.Telegram?.WebApp;
  if (tg?.onEvent) {
    try {
      tg.onEvent('themeChanged', notify);
    } catch {
      // ignore
    }
  }

  return () => {
    mql.removeEventListener('change', notify);
    if (tg?.offEvent) {
      try {
        tg.offEvent('themeChanged', notify);
      } catch {
        // ignore
      }
    }
  };
}
