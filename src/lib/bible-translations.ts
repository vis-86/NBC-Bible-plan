export type Testament = 'ot' | 'nt';

export type BibleTranslationId = 'rst' | 'cassian' | 'nrp' | 'kassian2019' | 'nrt2019';

export interface BibleTranslationDescriptor {
  id: BibleTranslationId;
  label: string;
  supports: Record<Testament, boolean>;
  /**
   * Можно ли легально хранить полный текст в этом репозитории/БД и раздавать через наше API
   * без отдельного письменного разрешения.
   *
   * По умолчанию держим строгий allowlist (чтобы не включить защищённые переводы случайно).
   * Датасеты `kassian2019` / `nrt2019` собираются скриптом `npm run bible:import` из модулей BibleQuote;
   * перед продакшеном сверить лицензию с правообладателем (см. copyright в bibleqt.INI источника).
   */
  selfHostedAllowed: boolean;
}

export const BIBLE_TRANSLATIONS: Record<BibleTranslationId, BibleTranslationDescriptor> = {
  rst: {
    id: 'rst',
    label: 'Синодальный',
    supports: { ot: true, nt: true },
    selfHostedAllowed: true
  },
  cassian: {
    id: 'cassian',
    label: 'Кассиан (НЗ)',
    supports: { ot: false, nt: true },
    selfHostedAllowed: false
  },
  nrp: {
    id: 'nrp',
    label: 'НРП',
    supports: { ot: true, nt: true },
    selfHostedAllowed: false
  },
  kassian2019: {
    id: 'kassian2019',
    label: 'Кассиан (Безобразов), 2019',
    supports: { ot: false, nt: true },
    selfHostedAllowed: true
  },
  nrt2019: {
    id: 'nrt2019',
    label: 'НРТ, 2019',
    supports: { ot: true, nt: true },
    selfHostedAllowed: true
  }
};

export function isBibleTranslationId(value: unknown): value is BibleTranslationId {
  return (
    value === 'rst' ||
    value === 'cassian' ||
    value === 'nrp' ||
    value === 'kassian2019' ||
    value === 'nrt2019'
  );
}

export function getSelfHostedTranslationOptions(testament: Testament): BibleTranslationDescriptor[] {
  return Object.values(BIBLE_TRANSLATIONS).filter(
    t => t.selfHostedAllowed && t.supports[testament]
  );
}

export function resolveSelfHostedTranslationId(
  requested: unknown,
  testament: Testament,
  fallback: BibleTranslationId = 'rst'
): BibleTranslationId {
  if (!isBibleTranslationId(requested)) return fallback;
  const descriptor = BIBLE_TRANSLATIONS[requested];
  if (!descriptor.supports[testament]) return fallback;
  if (!descriptor.selfHostedAllowed) return fallback;
  return requested;
}

