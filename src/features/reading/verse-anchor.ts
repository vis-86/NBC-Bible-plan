const DEBUG = (process.env.NEXT_PUBLIC_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'debug') === 'debug';
function debug(...args: unknown[]) {
  if (DEBUG) console.debug('[verse-anchor]', ...args);
}

/**
 * Первый видимый стих в контейнере — верс, чей `data-verse`-якорь (см. BibleText.tsx)
 * пересекает верхнюю границу контейнера. `offsetPx` — на случай перекрывающей шапки
 * (у ReadingHeader шапка — flex-сосед контейнера прокрутки, не наложение, поэтому
 * дефолт 0; параметр оставлен для контейнеров с наложенной sticky-шапкой).
 */
export function getTopVisibleVerse(container: HTMLElement, offsetPx = 0): number | null {
  const anchors = container.querySelectorAll<HTMLElement>('[data-verse]');
  const boundary = container.getBoundingClientRect().top + offsetPx;

  let result: number | null = null;
  for (const el of anchors) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom >= boundary) {
      const verse = Number(el.dataset.verse);
      result = Number.isNaN(verse) ? null : verse;
      break;
    }
  }

  debug('top visible verse', result);
  return result;
}

/**
 * Скроллит контейнер так, чтобы стих `verse` оказался у верхней границы контейнера.
 * Без smooth — мгновенно, чтобы не было визуального прыжка при смене перевода.
 */
export function scrollToVerse(container: HTMLElement, verse: number, offsetPx = 0): boolean {
  const anchor = container.querySelector<HTMLElement>(`[data-verse="${verse}"]`);
  if (!anchor) {
    console.warn('[verse-anchor] restore to verse=%s found=false', verse);
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const targetScrollTop = container.scrollTop + (anchorRect.top - containerRect.top) - offsetPx;

  container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'auto' });
  debug('restore to verse', verse, 'found=true');
  return true;
}
