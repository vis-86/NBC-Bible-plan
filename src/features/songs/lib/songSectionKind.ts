/**
 * Классификация секции песни по тексту метки `{comment:}` (§3.6).
 *
 * Директив окружения `{soc}`/`{eoc}` в корпусе нет (§2), поэтому тип секции выводится
 * ТОЛЬКО из метки. Классификатор не знает о директивах и не должен.
 *
 * Два неочевидных места, оба стоили бы бага в проде:
 *
 * 1. `\b` не работает с кириллицей: в JS `\w` — ASCII, поэтому `/припев\b/` НЕ матчит
 *    «припев» в конце строки. Продолжение слова отсекается через `(?![а-яё])`.
 * 2. Порядок правил — часть контракта: `Предприпев` содержит `припев`, поэтому
 *    `prechorus` обязан проверяться ДО `chorus`.
 * 3. Ремарка в скобках — не тип секции: в `Куплет 3 (модуляция)` вид задаёт «Куплет»,
 *    а «модуляция» — указание исполнителю. Скобки отсекаются ДО матчинга, иначе такой
 *    куплет уехал бы в `instrumental`.
 */

export type SongSectionKind =
  | 'verse'
  | 'chorus'
  | 'prechorus'
  | 'bridge'
  | 'instrumental'
  | 'ending'
  | 'other';

/** Виды секций, которым рендер даёт полупрозрачную подложку (§3.6). */
export const MARKED_SECTION_KINDS: ReadonlySet<SongSectionKind> = new Set<SongSectionKind>([
  'chorus',
  'bridge',
  'prechorus',
]);

/**
 * Имя DOM-атрибута с видом секции — единственный источник, по образцу `inkAnchor.ts`.
 * Импортируется и писателем (`SectionRenderer`), и читателями (CSS-тесты, e2e).
 */
export const SONG_SECTION_KIND_ATTR = 'data-song-section-kind';

/** Первое совпадение выигрывает — порядок значим, см. шапку файла. */
const RULES: ReadonlyArray<readonly [SongSectionKind, RegExp]> = [
  ['prechorus', /предприпев|пре-припев|выход на припев/],
  ['chorus', /припев(?![а-яё])/],
  ['bridge', /бридж|мост(?![а-яё])|\bbridge\b/],
  ['instrumental', /вступление|проигрыш|инструмент|модуляц|\bintro\b|instrum|modulation/],
  ['ending', /завершени|концовк|кода(?![а-яё])|\bend\b|\btag\b/],
  ['verse', /куплет(?![а-яё])/],
];

/** Ремарки исполнителю в скобках: `(a capella)`, `(модуляция)`, `(ff)`. См. п.3 в шапке. */
const REMARK_RE = /\([^)]*\)/g;

/** Пустая или отсутствующая метка → `other`: первая секция песни бывает без `{comment:}`. */
export function classifySection(label: string | undefined): SongSectionKind {
  const normalized = label?.replace(REMARK_RE, ' ').trim().toLowerCase();
  if (!normalized) return 'other';

  for (const [kind, pattern] of RULES) {
    if (pattern.test(normalized)) return kind;
  }
  return 'other';
}
