import { describe, it, expect } from 'vitest';
import { pitch, sheetCount, sheetPageHeight, nextPageDelta, SHEET_PADDING_TOP } from './sheets';

describe('pitch', () => {
  // Подводный камень 1 (§4.2): шаг = ширина + column-gap.
  it('adds the column gap to the flow width', () => {
    expect(pitch(600, 32)).toBe(632);
  });

  it('falls back to the bare width when the gap is not a number (getComputedStyle → NaN)', () => {
    expect(pitch(600, Number.NaN)).toBe(600);
  });

  it('returns 0 for a container that has not been laid out yet', () => {
    expect(pitch(0, 32)).toBe(0);
  });
});

describe('sheetCount', () => {
  it('splits content wider than one page', () => {
    // 632 * 2 = 1264 < 1500 ⇒ нужен третий лист.
    expect(sheetCount(1500, 632)).toBe(3);
  });

  // Подводный камень 3 (§4.2): контент ровно кратен шагу — хвостового пустого листа быть не должно.
  it('does not add a trailing empty sheet when the content is an exact multiple of the pitch', () => {
    expect(sheetCount(1264, 632)).toBe(2);
    expect(sheetCount(632, 632)).toBe(1);
  });

  it('keeps a single sheet for content narrower than the page', () => {
    expect(sheetCount(400, 632)).toBe(1);
  });

  it('keeps a single sheet when the pitch is unknown (zero width)', () => {
    expect(sheetCount(1500, 0)).toBe(1);
  });
});

describe('nextPageDelta', () => {
  // Педали шлют именно эти коды (§4.4) — резолвер чистый, чтобы не проверять это в e2e.
  it.each(['ArrowRight', 'PageDown', ' ', 'Spacebar'])('turns forward on %s', (key) => {
    expect(nextPageDelta(key)).toBe(1);
  });

  it.each(['ArrowLeft', 'PageUp'])('turns back on %s', (key) => {
    expect(nextPageDelta(key)).toBe(-1);
  });

  it.each(['Enter', 'a', 'ArrowUp', 'ArrowDown', 'Escape'])('ignores %s', (key) => {
    expect(nextPageDelta(key)).toBe(0);
  });
});

describe('sheetPageHeight', () => {
  it('reserves the sheet top padding so the sheet fits the viewport', () => {
    expect(sheetPageHeight(800)).toBe(800 - SHEET_PADDING_TOP);
  });

  it('never goes negative on a collapsed viewport', () => {
    expect(sheetPageHeight(10)).toBe(0);
  });
});
