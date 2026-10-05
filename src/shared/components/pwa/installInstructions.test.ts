import { describe, it, expect } from 'vitest';
import { getInstallInstructions, getOpenInBrowserInstructions } from './installInstructions';

const titles = (platform: 'ios' | 'android', browser: Parameters<typeof getInstallInstructions>[1]) =>
  getInstallInstructions(platform, browser).steps.map((s) => s.title);

describe('getInstallInstructions', () => {
  it('iOS Safari: подсказывает «•••» (iOS 26 прячет «Поделиться») и переключатель веб-приложения', () => {
    const { steps } = getInstallInstructions('ios', 'safari');
    expect(steps[0].text).toContain('«•••»');
    expect(titles('ios', 'safari')).toEqual([
      'Нажмите «Поделиться»',
      'Выберите «На экран „Домой“»',
      'Оставьте включённым «Открыть как веб-приложение»',
      'Нажмите «Добавить»',
    ]);
  });

  it('iOS Chrome: «Поделиться» в адресной строке, а не «Откройте в Safari»', () => {
    const { steps } = getInstallInstructions('ios', 'chrome');
    expect(steps[0].text).toContain('строке с адресом');
    expect(steps.some((s) => s.text.includes('не работает'))).toBe(false);
  });

  it('Android Chrome: меню → «Установить приложение»', () => {
    expect(titles('android', 'chrome')).toEqual([
      'Откройте меню браузера',
      'Выберите «Установить приложение»',
      'Нажмите «Установить»',
    ]);
    expect(getInstallInstructions('android', 'chrome').note).toBeUndefined();
  });

  it('Яндекс Браузер: свой пункт меню + совет про Chrome', () => {
    const result = getInstallInstructions('android', 'yandex');
    expect(result.steps[1].title).toBe('Выберите «Добавить на гл. экран»');
    expect(result.note).toContain('Chrome');
  });

  it('у всех шагов уникальные заголовки (используются как key)', () => {
    for (const [p, b] of [['ios', 'safari'], ['ios', 'firefox'], ['android', 'samsung'], ['android', 'yandex']] as const) {
      const t = titles(p, b);
      expect(new Set(t).size).toBe(t.length);
    }
  });
});

describe('getOpenInBrowserInstructions', () => {
  it('называет браузер платформы', () => {
    expect(getOpenInBrowserInstructions('ios').steps[1].text).toContain('Safari');
    expect(getOpenInBrowserInstructions('android').steps[1].text).toContain('Chrome');
  });
});
