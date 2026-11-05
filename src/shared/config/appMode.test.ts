import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWebManifest, getAppBrand, getAppIconsPath, getAppMode, getStartPath, isWorshipMode } from './appMode';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appMode', () => {
  it('по умолчанию — church', () => {
    expect(getAppMode()).toBe('church');
    expect(isWorshipMode()).toBe(false);
    expect(getStartPath()).toBe('/dashboard');
  });

  it('неизвестное значение трактуется как church', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'something');
    expect(getAppMode()).toBe('church');
  });

  it('worship включается переменной и меняет стартовый путь', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
    expect(isWorshipMode()).toBe(true);
    expect(getStartPath()).toBe('/dashboard/songs');
  });

  describe('бренд', () => {
    it('church: прежнее имя приложения', () => {
      expect(getAppBrand()).toMatchObject({ name: 'NBC Bible Plan', shortName: 'Bible Plan' });
    });

    it('church игнорирует NEXT_PUBLIC_APP_NAME', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'Other');
      expect(getAppBrand().name).toBe('NBC Bible Plan');
    });

    it('worship: плейсхолдер «Аккорды», если имя не задано', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
      expect(getAppBrand()).toMatchObject({ name: 'Аккорды', shortName: 'Аккорды' });
    });

    it('worship: имя и короткое имя из переменных', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
      vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'Хвала');
      vi.stubEnv('NEXT_PUBLIC_APP_SHORT_NAME', 'Хв');
      expect(getAppBrand()).toMatchObject({ name: 'Хвала', shortName: 'Хв' });
    });
  });

  describe('buildWebManifest', () => {
    it('church: прежний манифест (имя, start_url, scope)', () => {
      const m = buildWebManifest('/app');
      expect(m.name).toBe('NBC Bible Plan');
      expect(m.short_name).toBe('Bible Plan');
      expect(m.description).toBe('План чтения Библии Нижегородской Библейской Церкви');
      expect(m.start_url).toBe('/app/dashboard');
      expect(m.scope).toBe('/app/');
      expect(m.icons[0].src).toBe('/app/icons/icon-192.png');
    });

    it('worship: бренд и start_url на список песен', () => {
      vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
      vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'Хвала');
      const m = buildWebManifest('');
      expect(m.name).toBe('Хвала');
      expect(m.short_name).toBe('Хвала');
      expect(m.start_url).toBe('/dashboard/songs');
      expect(m.scope).toBe('/');
    });

    it('иконки: у витрины свой набор, у church — прежние пути', () => {
      expect(buildWebManifest('/app').icons.map((i) => i.src)).toEqual([
        '/app/icons/icon-192.png',
        '/app/icons/icon-512.png',
        '/app/icons/icon-512.png',
      ]);
      vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'worship');
      expect(buildWebManifest('/app').icons.map((i) => i.src)).toEqual([
        '/app/icons/worship/icon-192.png',
        '/app/icons/worship/icon-512.png',
        '/app/icons/worship/icon-512.png',
      ]);
      expect(getAppIconsPath('/app')).toBe('/app/icons/worship');
    });
  });
});
