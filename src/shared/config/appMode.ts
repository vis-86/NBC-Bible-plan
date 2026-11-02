/**
 * Режим сборки приложения — единственное место, где читаются `NEXT_PUBLIC_APP_MODE`
 * и бренд витрины. `church` (по умолчанию) — приложение церкви как есть; `worship` —
 * витрина для музыкальных команд: только песни и сеты под своим брендом.
 *
 * Значения читаются при вызове (а не на уровне модуля): Next инлайнит литералы
 * `process.env.NEXT_PUBLIC_*` при сборке, а тесты переключают режим через `vi.stubEnv`.
 */
export type AppMode = 'church' | 'worship';

export interface AppBrand {
  name: string;
  shortName: string;
  description: string;
}

const CHURCH_BRAND: AppBrand = {
  name: 'NBC Bible Plan',
  shortName: 'Bible Plan',
  description: 'План чтения Библии Нижегородской Библейской Церкви',
};

// Плейсхолдер: имя витрины ещё не выбрано, переопределяется NEXT_PUBLIC_APP_NAME.
const WORSHIP_DEFAULT_NAME = 'Аккорды';

export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE === 'worship' ? 'worship' : 'church';
}

export function isWorshipMode(): boolean {
  return getAppMode() === 'worship';
}

export function getAppBrand(): AppBrand {
  if (!isWorshipMode()) return CHURCH_BRAND;
  const name = process.env.NEXT_PUBLIC_APP_NAME?.trim() || WORSHIP_DEFAULT_NAME;
  const shortName = process.env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || name;
  return { name, shortName, description: 'Песни и сеты вашей музыкальной команды' };
}

/** Стартовая страница после входа: у витрины нет плана чтения. */
export function getStartPath(): string {
  return isWorshipMode() ? '/dashboard/songs' : '/dashboard';
}

/**
 * Web App Manifest для текущего режима. Чистая функция (используется
 * `scripts/build-manifest.ts` и тестами): `church` даёт прежний манифест без изменений.
 */
export function buildWebManifest(basePath: string) {
  const brand = getAppBrand();
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: `${basePath}${getStartPath()}`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#ffffff',
    // = светлый --app-bg: дефолтный цвет брови до гидрации (runtime-цвет
    // ставит statusBarColor); Android берёт отсюда тинт при запуске.
    theme_color: '#FAFAF9',
    orientation: 'portrait-primary',
    lang: 'ru',
    icons: [
      { src: `${basePath}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
