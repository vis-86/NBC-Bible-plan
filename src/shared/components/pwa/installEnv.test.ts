import { describe, it, expect } from 'vitest';
import { detectInstallEnv } from './installEnv';

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  iosWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iosInstagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 380.0.0.0',
  iPadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  androidYandex:
    'Mozilla/5.0 (Linux; Android 13; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 YaBrowser/25.6.1.80.00 SA/3 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  androidTelegram:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 Telegram-Android/11.14.1',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

describe('detectInstallEnv', () => {
  it.each([
    ['iosSafari', 0, { os: 'ios', browser: 'safari', inApp: false }],
    ['iosChrome', 0, { os: 'ios', browser: 'chrome', inApp: false }],
    ['iosWebView', 0, { os: 'ios', browser: 'other', inApp: true }],
    ['iosInstagram', 0, { os: 'ios', browser: 'other', inApp: true }],
    ['iPadOs', 5, { os: 'ios', browser: 'safari', inApp: false }],
    ['androidChrome', 0, { os: 'android', browser: 'chrome', inApp: false }],
    ['androidYandex', 0, { os: 'android', browser: 'yandex', inApp: false }],
    ['androidSamsung', 0, { os: 'android', browser: 'samsung', inApp: false }],
    ['androidTelegram', 0, { os: 'android', browser: 'chrome', inApp: true }],
    ['androidWebView', 0, { os: 'android', browser: 'chrome', inApp: true }],
    ['desktopChrome', 0, { os: 'other', browser: 'chrome', inApp: false }],
  ] as const)('%s', (key, touchPoints, expected) => {
    expect(detectInstallEnv(UA[key], touchPoints)).toEqual(expected);
  });

  it('десктопный Mac без тача не считается iPad', () => {
    expect(detectInstallEnv(UA.iPadOs, 0).os).toBe('other');
  });
});
