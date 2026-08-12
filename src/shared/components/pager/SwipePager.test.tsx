// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { SwipePager, progressForDelta, shiftForDelta } from './SwipePager';

function fireSwipe(el: Element, startX: number, startY: number, dx: number, dy: number) {
  fireEvent.pointerDown(el, { clientX: startX, clientY: startY });
  fireEvent.pointerMove(el, { clientX: startX + dx, clientY: startY + dy });
  fireEvent.pointerUp(el, { clientX: startX + dx, clientY: startY + dy });
}

describe('SwipePager', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('свайп влево сверх порога → onNext', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, -100, 0);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('свайп вправо сверх порога → onPrev', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, 100, 0);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('диагональ (dx=70, dy=60) → ни одного колбэка', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, 70, 60);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('старт при clientX = 10 → жест игнорируется', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 10, 100, -100, 0);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('canNext=false, onEnd не задан, свайп влево → колбэков нет', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext={false} onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, -100, 0);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('canNext=false, onEnd задан, свайп влево → вызван onEnd, не onNext', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onEnd = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext={false} onPrev={onPrev} onNext={onNext} onEnd={onEnd}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, -100, 0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('enabled=false → на корне нет onpointerdown', () => {
    const { container } = render(
      <SwipePager enabled={false} canPrev canNext onPrev={vi.fn()} onNext={vi.fn()}>
        <div>content</div>
      </SwipePager>
    );
    const root = container.querySelector('[data-swipe-pager]') as HTMLElement;
    expect(root.onpointerdown).toBeNull();
  });

  it('сдвиг контента упирается в 20px, как далеко ни уехал бы палец', () => {
    expect(Math.abs(shiftForDelta(-1000, 20))).toBeLessThan(20);
    expect(Math.abs(shiftForDelta(-1000, 20))).toBeGreaterThan(19);
    // Монотонность: дальше палец — больше сдвиг, но всегда в пределах потолка.
    expect(Math.abs(shiftForDelta(-30, 20))).toBeLessThan(Math.abs(shiftForDelta(-60, 20)));

    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={vi.fn()} onNext={vi.fn()}>
        <div>content</div>
      </SwipePager>
    );
    const root = container.querySelector('[data-swipe-pager]') as HTMLElement;
    const content = container.querySelector('[data-swipe-pager-content]') as HTMLElement;

    fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(root, { clientX: -300, clientY: 100 });

    const shift = Number(/translateX\((-?[\d.]+)px\)/.exec(content.style.transform)?.[1]);
    expect(Math.abs(shift)).toBeLessThanOrEqual(20);
    // Сдвигается контент, а не корень: подсказка лежит в корне и обязана стоять на месте.
    expect(root.style.transform).toBe('');
  });

  it('прогресс жеста доходит до 1 ровно на пороге перехода (60px)', () => {
    expect(progressForDelta(-30)).toBeCloseTo(0.5);
    expect(progressForDelta(-60)).toBe(1);
    expect(progressForDelta(-500)).toBe(1);

    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={vi.fn()} onNext={vi.fn()}>
        <div>content</div>
      </SwipePager>
    );
    const root = container.querySelector('[data-swipe-pager]') as HTMLElement;
    fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(root, { clientX: 170, clientY: 100 });
    expect(Number(root.style.getPropertyValue('--swipe-progress'))).toBeCloseTo(0.5);
    fireEvent.pointerMove(root, { clientX: 100, clientY: 100 });
    expect(Number(root.style.getPropertyValue('--swipe-progress'))).toBe(1);
  });

  it('overlay рендерится вне сдвигаемого узла', () => {
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={vi.fn()} onNext={vi.fn()} overlay={<div data-test-overlay />}>
        <div>content</div>
      </SwipePager>
    );
    const content = container.querySelector('[data-swipe-pager-content]') as HTMLElement;
    expect(content.querySelector('[data-test-overlay]')).toBeNull();
    expect(container.querySelector('[data-swipe-pager] > [data-test-overlay]')).toBeTruthy();
  });

  it('отпустили, не дойдя до порога (30px) → перехода нет', () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    fireSwipe(container.querySelector('[data-swipe-pager]')!, 200, 100, -30, 0);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  /**
   * Регрессия Android: Chrome отбирает поток указателя, как только решит, что началась
   * прокрутка, и присылает `pointercancel` вместо `pointerup`. Жест при этом молча
   * откатывался — «страница дёрнулась, песня не переключилась».
   */
  describe('жест оборван браузером (pointercancel)', () => {
    const renderPager = (onNext: () => void, onPrev: () => void) =>
      render(
        <SwipePager enabled canPrev canNext onPrev={onPrev} onNext={onNext}>
          <div>content</div>
        </SwipePager>
      ).container.querySelector('[data-swipe-pager]') as HTMLElement;

    it('состоявшийся свайп доводится до перехода', () => {
      const onNext = vi.fn();
      const root = renderPager(onNext, vi.fn());
      fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
      fireEvent.pointerMove(root, { clientX: 100, clientY: 100 });
      // Координат `pointercancel` не несёт — решение по последней точке движения.
      fireEvent.pointerCancel(root, { clientX: 0, clientY: 0 });
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it('движение не дошло до порога → перехода нет', () => {
      const onNext = vi.fn();
      const onPrev = vi.fn();
      const root = renderPager(onNext, onPrev);
      fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
      fireEvent.pointerMove(root, { clientX: 170, clientY: 100 });
      fireEvent.pointerCancel(root, { clientX: 170, clientY: 100 });
      expect(onNext).not.toHaveBeenCalled();
      expect(onPrev).not.toHaveBeenCalled();
    });

    it('два пальца на экране → это пинч, а не свайп', () => {
      const onNext = vi.fn();
      const root = renderPager(onNext, vi.fn());
      fireEvent.pointerDown(root, { pointerId: 1, clientX: 200, clientY: 100 });
      fireEvent.pointerMove(root, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerDown(root, { pointerId: 2, clientX: 260, clientY: 140 });
      fireEvent.pointerCancel(root, { pointerId: 1, clientX: 100, clientY: 100 });
      expect(onNext).not.toHaveBeenCalled();
    });
  });

  it('включённый пейджер не отдаёт горизонталь браузеру (touch-action: pan-y)', () => {
    // Внутри лежит скролл-контейнер, которому глобальный CSS разрешает `pan-x pan-y`:
    // без этого ограничения Android Chrome забирает горизонтальный жест себе.
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={vi.fn()} onNext={vi.fn()}>
        <div>content</div>
      </SwipePager>
    );
    expect((container.querySelector('[data-swipe-pager]') as HTMLElement).style.touchAction).toBe('pan-y');
  });

  it('matchMedia замокан на prefers-reduced-motion: reduce → style.transform пуст, но коммит произошёл', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const onNext = vi.fn();
    const { container } = render(
      <SwipePager enabled canPrev canNext onPrev={vi.fn()} onNext={onNext}>
        <div>content</div>
      </SwipePager>
    );
    const root = container.querySelector('[data-swipe-pager]') as HTMLElement;
    const content = container.querySelector('[data-swipe-pager-content]') as HTMLElement;
    fireEvent.pointerDown(root, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(root, { clientX: 100, clientY: 100 });
    expect(content.style.transform).toBe('');
    fireEvent.pointerUp(root, { clientX: 100, clientY: 100 });
    expect(onNext).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
