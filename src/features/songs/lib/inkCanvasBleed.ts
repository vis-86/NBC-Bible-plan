/**
 * Вылет холста пометок за пределы потока строк (§6).
 *
 * Хост слоя — это поток песни, а лист на экране больше: шапка песни над потоком,
 * боковые поля, верхнее поле листа, пустота под последней строкой короткой песни.
 * Пока холст совпадал с потоком, там не рисовалось — на планшете это добрая треть
 * экрана. Холст вылетает за поток до границ своей поверхности (лист или скролл-
 * контейнер); штрих оттуда якорится к ближайшей строке, как и любой другой.
 */

/** Прямоугольник в экранных координатах. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Вылет в px слоя (до масштаба), каждый край ≥ 0. */
export interface InkBleed {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const NO_BLEED: InkBleed = { left: 0, top: 0, right: 0, bottom: 0 };

/**
 * Насколько поверхность выходит за видимое окно потока. Экранные px переводятся в px
 * слоя делением на масштаб: холст живёт внутри увеличенной сцены.
 */
export function canvasBleed(flow: ScreenBox, surface: ScreenBox, scale: number): InkBleed {
  const s = scale > 0 ? scale : 1;
  const edge = (value: number) => Math.max(0, Math.round(value / s));
  return {
    left: edge(flow.left - surface.left),
    top: edge(flow.top - surface.top),
    right: edge(surface.right - flow.right),
    bottom: edge(surface.bottom - flow.bottom),
  };
}

export function sameBleed(a: InkBleed, b: InkBleed): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

/**
 * Поверхность скролл-контейнера в экранных координатах — вся область прокрутки, а не
 * только видимая часть: от верха контента до низа контента, но не короче самого
 * контейнера (короткая песня — холст до низа экрана).
 *
 * Низ контента берётся по последнему ребёнку, а не по `scrollHeight`: холст сам
 * расширяет область прокрутки, и `scrollHeight` после первого замера включал бы его же.
 */
export function viewportSurface(viewport: HTMLElement): ScreenBox {
  const rect = viewport.getBoundingClientRect();
  const left = rect.left + viewport.clientLeft - viewport.scrollLeft;
  const top = rect.top + viewport.clientTop - viewport.scrollTop;
  const style = getComputedStyle(viewport);
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const last = viewport.lastElementChild;
  const contentBottom = last ? last.getBoundingClientRect().bottom + paddingBottom : top;
  return {
    left,
    top,
    right: left + viewport.clientWidth,
    bottom: Math.max(top + viewport.clientHeight, contentBottom),
  };
}
