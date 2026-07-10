// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTopVisibleVerse, scrollToVerse } from './verse-anchor';

function makeContainer(verseTops: Record<number, number>): HTMLElement {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => ({ top: 0, bottom: 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: 0, toJSON() {} });

  for (const [verse, top] of Object.entries(verseTops)) {
    const anchor = document.createElement('strong');
    anchor.dataset.verse = verse;
    anchor.getBoundingClientRect = () => ({ top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: top, toJSON() {} });
    container.appendChild(anchor);
  }

  return container;
}

describe('verse-anchor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTopVisibleVerse', () => {
    it('возвращает первый стих, чей якорь пересекает верхнюю границу контейнера', () => {
      // Верхняя граница контейнера — top=0; стих 1 уже проскроллен выше (bottom=-10 < 0),
      // стих 2 пересекает границу (top=-5, bottom=15 >= 0) — он и есть «текущий видимый».
      const container = makeContainer({ 1: -30, 2: -5, 3: 40 });
      expect(getTopVisibleVerse(container)).toBe(2);
    });

    it('нет якорей в контейнере -> null', () => {
      const container = makeContainer({});
      expect(getTopVisibleVerse(container)).toBeNull();
    });

    it('все стихи ниже границы -> первый по порядку', () => {
      const container = makeContainer({ 1: 10, 2: 50 });
      expect(getTopVisibleVerse(container)).toBe(1);
    });
  });

  describe('scrollToVerse', () => {
    it('скроллит контейнер так, чтобы якорь стиха оказался у верхней границы', () => {
      const container = makeContainer({ 5: 120 });
      container.scrollTop = 0;
      const scrollToSpy = vi.fn();
      container.scrollTo = scrollToSpy;

      const found = scrollToVerse(container, 5);

      expect(found).toBe(true);
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 120, behavior: 'auto' });
    });

    it('якорь не найден -> false + warn, scrollTo не вызывается', () => {
      const container = makeContainer({ 1: 0 });
      const scrollToSpy = vi.fn();
      container.scrollTo = scrollToSpy;

      const found = scrollToVerse(container, 99);

      expect(found).toBe(false);
      expect(scrollToSpy).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });
  });
});
