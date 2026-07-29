// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useInkStage } from './useInkStage';

/**
 * Владение прокруткой в режиме пометок. Нативного зума страницы в приложении нет,
 * поэтому масштаб всегда наш; а вот сдвиг листа принадлежит либо браузеру
 * («только стилус», `touch-action: pan-x pan-y`), либо жесту — но никогда обоим:
 * двойное применение и было «скроллится непредсказуемо».
 */
function setup(penOnly: boolean) {
  const viewport = document.createElement('div');
  // jsdom не раскладывает элементы — размеры и диапазон прокрутки задаём руками.
  Object.defineProperty(viewport, 'clientWidth', { value: 300 });
  Object.defineProperty(viewport, 'clientHeight', { value: 500 });
  viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 500 }) as DOMRect;
  viewport.scrollTop = 100;
  viewport.scrollLeft = 50;

  // Ref-объекты создаём ОДИН раз: литерал в теле рендера — новая ссылка каждый раз,
  // и эффект измерения зацикливается (наступили при написании этого теста).
  const viewportRef = { current: viewport as HTMLElement | null };
  const stageRef = { current: document.createElement('div') as HTMLElement | null };
  const view = renderHook(() => useInkStage({ viewportRef, stageRef, active: true, penOnly }));
  return { ...view, viewport };
}

describe('useInkStage', () => {
  it('без «только стилус» жест двигает лист сам', () => {
    const { result, viewport } = setup(false);
    act(() => result.current.applyGesture({ dx: 10, dy: 20, scale: 1, clientX: 150, clientY: 250 }));
    expect(viewport.scrollLeft).toBe(40);
    expect(viewport.scrollTop).toBe(80);
  });

  it('при «только стилус» сдвиг не применяется — скроллит браузер', () => {
    const { result, viewport } = setup(true);
    act(() => result.current.applyGesture({ dx: 10, dy: 20, scale: 1, clientX: 150, clientY: 250 }));
    expect(viewport.scrollLeft).toBe(50);
    expect(viewport.scrollTop).toBe(100);
  });

  it('точка под пальцами остаётся на месте: прокрутка правится в том же коммите', () => {
    // Раньше правка ехала в requestAnimationFrame и приезжала ДО того, как обёртка
    // выросла под новый масштаб: браузер обрезал scrollTop по старому диапазону,
    // и строка убегала вниз. Ассерт сразу после act — гарантия, что правка синхронная.
    const { result, viewport } = setup(false);
    act(() => result.current.applyGesture({ dx: 0, dy: 0, scale: 1.5, clientX: 150, clientY: 250 }));
    // anchorY = 100 + 250 = 350 ⇒ 350 * 1.5 − 250 = 275; anchorX = 50 + 150 = 200 ⇒ 150.
    expect(viewport.scrollTop).toBe(275);
    expect(viewport.scrollLeft).toBe(150);
  });

  it('масштаб жеста применяется в обоих режимах', () => {
    for (const penOnly of [false, true]) {
      const { result } = setup(penOnly);
      act(() => result.current.applyGesture({ dx: 0, dy: 0, scale: 1.5, clientX: 150, clientY: 250 }));
      expect(result.current.zoom).toBeCloseTo(1.5);
    }
  });
});
