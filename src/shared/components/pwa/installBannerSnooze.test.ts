// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  INSTALL_BANNER_SNOOZED_AT_KEY,
  INSTALL_BANNER_SNOOZE_MS,
  isInstallBannerSnoozed,
  snoozeInstallBanner,
} from './installBannerSnooze';

describe('installBannerSnooze', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('без записи плашка не скрыта', () => {
    expect(isInstallBannerSnoozed()).toBe(false);
  });

  it('«Не сейчас» скрывает ровно на 7 дней', () => {
    const now = 1_700_000_000_000;
    snoozeInstallBanner(now);
    expect(window.localStorage.getItem(INSTALL_BANNER_SNOOZED_AT_KEY)).toBe(String(now));
    expect(isInstallBannerSnoozed(now + INSTALL_BANNER_SNOOZE_MS - 1)).toBe(true);
    expect(isInstallBannerSnoozed(now + INSTALL_BANNER_SNOOZE_MS)).toBe(false);
  });

  it('мусор в хранилище не прячет плашку навсегда', () => {
    window.localStorage.setItem(INSTALL_BANNER_SNOOZED_AT_KEY, 'not-a-number');
    expect(isInstallBannerSnoozed()).toBe(false);
  });

  it('недоступный localStorage не роняет ни чтение, ни запись', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isInstallBannerSnoozed()).toBe(false);
    expect(() => snoozeInstallBanner()).not.toThrow();
  });
});
