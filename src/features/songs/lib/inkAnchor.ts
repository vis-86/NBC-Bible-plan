/**
 * Якорь рукописных пометок (M10, §6): единственный источник имён DOM-атрибутов,
 * которыми строка песни помечена для слоя рисования.
 *
 * Константы обязаны импортироваться и писателем (`LineRenderer`), и читателем
 * (`inkGeometry`): литерал, повторённый в двух местах, уже давал в этом проекте
 * тихий рассинхрон (`useSongs` vs `downloadSongs`).
 */

export const SONG_LINE_SECTION_ATTR = 'data-song-line-section';
export const SONG_LINE_INDEX_ATTR = 'data-song-line-index';

/** Селектор всех якорных строк — им же слой собирает bounding box'ы. */
export const SONG_LINE_SELECTOR = `[${SONG_LINE_SECTION_ATTR}][${SONG_LINE_INDEX_ATTR}]`;

/** Селектор одной конкретной строки. Искать ТОЛЬКО от корня своего листа (см. ниже). */
export function songLineSelector(section: number, line: number): string {
  return `[${SONG_LINE_SECTION_ATTR}="${section}"][${SONG_LINE_INDEX_ATTR}="${line}"]`;
}

/** Пропсы якоря для JSX — чтобы имена атрибутов нигде не дублировались строкой. */
export function songLineAnchorProps(section: number, line: number): Record<string, number> {
  return { [SONG_LINE_SECTION_ATTR]: section, [SONG_LINE_INDEX_ATTR]: line };
}

/** Якорь, прочитанный из DOM-элемента строки. null — элемент не якорный. */
export function readSongLineAnchor(el: Element): { section: number; line: number } | null {
  const section = Number(el.getAttribute(SONG_LINE_SECTION_ATTR));
  const line = Number(el.getAttribute(SONG_LINE_INDEX_ATTR));
  if (!Number.isInteger(section) || !Number.isInteger(line)) return null;
  return { section, line };
}
