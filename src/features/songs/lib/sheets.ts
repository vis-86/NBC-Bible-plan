/**
 * Чистая арифметика постраничной раскладки (§4.2). DOM здесь нет: все измерения
 * приходят аргументами, чтобы подводные камни закрывались юнит-тестами, а не e2e.
 */

/** Отступ сверху внутри листа (§4.3). Лист — `content-box`, поле идёт плюсом к высоте. */
export const SHEET_PADDING_TOP = 18;

/**
 * Внутреннее поле корня песни в постраничных режимах. Обязано совпадать с классом
 * `p-2` на `.cproSongBody`: нижняя его половина не видна из `chromeAboveFlow`
 * (тот меряет только то, что НАД потоком) и вычитается из высоты страницы отдельно.
 */
export const PAGE_PADDING = 8;

/**
 * Шаг между страницами — НЕ ширина потока: после последней колонки страницы идёт
 * `column-gap`, поэтому следующая пара колонок начинается с `width + gap`. Сдвиг на
 * голую ширину копит лишний отступ слева на каждом листе и завышает их число
 * (появляется пустой хвостовой лист).
 */
export function pitch(clientWidth: number, columnGap: number): number {
  const width = Number.isFinite(clientWidth) && clientWidth > 0 ? clientWidth : 0;
  const gap = Number.isFinite(columnGap) && columnGap > 0 ? columnGap : 0;
  return width === 0 ? 0 : width + gap;
}

/**
 * Число листов считается по правому краю последней секции, а не по `scrollWidth`:
 * multicol резервирует пустую хвостовую колонку и завышает ширину потока.
 * Допуск 2px гасит субпиксельное округление — без него контент, ровно кратный шагу,
 * даёт лишний пустой лист.
 */
export function sheetCount(maxSectionRight: number, pagePitch: number): number {
  if (!Number.isFinite(maxSectionRight) || !Number.isFinite(pagePitch) || pagePitch <= 0) return 1;
  return Math.max(1, Math.ceil((maxSectionRight - 2) / pagePitch));
}

/**
 * Высота потока страницы: содержимое скролл-контейнера минус то, что занимает
 * обвязка режима (поле листа в `sheets`), иначе страница вместе с обвязкой
 * не влезает в экран и низ срезается.
 */
export function sheetPageHeight(viewportContentHeight: number, reserved = SHEET_PADDING_TOP): number {
  if (!Number.isFinite(viewportContentHeight)) return 0;
  return Math.max(0, Math.round(viewportContentHeight - reserved));
}
