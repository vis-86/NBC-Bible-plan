export type InstallOs = 'ios' | 'android' | 'other';
export type InstallBrowser = 'safari' | 'chrome' | 'yandex' | 'samsung' | 'firefox' | 'edge' | 'other';

export interface InstallEnv {
  os: InstallOs;
  browser: InstallBrowser;
  /**
   * Сайт открыт во встроенном браузере приложения (Telegram, VK, Instagram…):
   * оттуда установить нельзя — сначала нужно открыть сайт в Safari/Chrome.
   * Эвристика по UA: SFSafariViewController (Telegram/WhatsApp на iPhone) от Safari
   * не отличить, поэтому в инструкциях всегда есть запасной путь «скопировать ссылку».
   */
  inApp: boolean;
}

const IN_APP_MARKERS =
  /Telegram|Instagram|FBAN|FBAV|FB_IAB|VKAndroidApp|VKClient|com\.vk\.|WhatsApp|MicroMessenger|Line\/|OKApp|YaApp|YandexSearch|GSA\//i;

function detectBrowser(ua: string): InstallBrowser {
  if (/YaBrowser/i.test(ua)) return 'yandex';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/EdgiOS|EdgA\/|Edg\//i.test(ua)) return 'edge';
  if (/FxiOS|Firefox\//i.test(ua)) return 'firefox';
  if (/CriOS|Chrome\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'safari';
  return 'other';
}

/**
 * Определяет, где открыт сайт, чтобы показать подходящую инструкцию установки.
 * `maxTouchPoints` нужен для iPadOS: он представляется десктопным «Macintosh».
 */
export function detectInstallEnv(userAgent: string, maxTouchPoints = 0): InstallEnv {
  const isIPadOs = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  const os: InstallOs = /iPhone|iPad|iPod/i.test(userAgent) || isIPadOs
    ? 'ios'
    : /Android/i.test(userAgent)
      ? 'android'
      : 'other';

  const inApp =
    IN_APP_MARKERS.test(userAgent) ||
    // Android WebView помечает себя «; wv)».
    (os === 'android' && /; wv\)/.test(userAgent)) ||
    // WKWebView на iOS не добавляет токен «Safari/» (его есть у Safari и у Chrome/Firefox iOS).
    (os === 'ios' && /AppleWebKit/i.test(userAgent) && !/Safari\//i.test(userAgent));

  return { os, browser: detectBrowser(userAgent), inApp };
}
