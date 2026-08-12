// @vitest-environment jsdom
/**
 * Ввод режима пометок на планшете. Оба разбора — из реального использования:
 * в постраничном режиме слоёв столько же, сколько листов, и пальцы двухпальцевого
 * жеста легко попадают на РАЗНЫЕ листы; palm rejection в браузере отсутствует как класс.
 */
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInkInput } from './useInkInput';

function mountLayer(onGesture?: () => void) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const handlers = {
    onBegin: vi.fn(),
    onMove: vi.fn(),
    onEnd: vi.fn(),
    onCancel: vi.fn(),
    onGesture: vi.fn(onGesture),
  };
  const view = renderHook(() =>
    useInkInput({ targetRef: { current: el }, enabled: true, penOnly: false, ...handlers })
  );
  return { el, handlers, unmount: view.unmount };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useInkInput — два листа на экране', () => {
  it('пальцы на разных листах = жест, а не два штриха', () => {
    const first = mountLayer();
    const second = mountLayer();

    // Палец лёг на первый лист — это ещё штрих.
    fireEvent.pointerDown(first.el, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(first.handlers.onBegin).toHaveBeenCalledTimes(1);

    // Второй палец — на СОСЕДНЕМ листе: раньше каждый слой видел по одному пальцу
    // и честно рисовал им линию поперёк песни.
    fireEvent.pointerDown(second.el, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 300 });
    expect(second.handlers.onBegin).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 260 });
    expect(first.handlers.onCancel).toHaveBeenCalled();
    expect(first.handlers.onMove).not.toHaveBeenCalled();
    expect(second.handlers.onMove).not.toHaveBeenCalled();

    // Жест отдаёт наверх ровно один слой — тот, на котором он начался.
    fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 220 });
    expect(first.handlers.onGesture).toHaveBeenCalled();
    expect(second.handlers.onGesture).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    first.unmount();
    second.unmount();
  });
});

describe('useInkInput — перо главнее пальца', () => {
  it('перо отменяет штрих ладони и рисует само', () => {
    const layer = mountLayer();

    // Ладонь легла первой — так и бывает: сначала опирается рука, потом пишет перо.
    fireEvent.pointerDown(layer.el, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50 });
    expect(layer.handlers.onBegin).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(layer.el, { pointerId: 2, pointerType: 'pen', clientX: 120, clientY: 120 });
    // Штрих ладони отменён, а не дорисован, и перо начало свой.
    expect(layer.handlers.onCancel).toHaveBeenCalled();
    expect(layer.handlers.onBegin).toHaveBeenCalledTimes(2);

    // Пока перо на листе, ладонь не рисует и не превращает штрих в жест.
    fireEvent.pointerDown(layer.el, { pointerId: 3, pointerType: 'touch', clientX: 60, clientY: 60 });
    expect(layer.handlers.onBegin).toHaveBeenCalledTimes(2);

    fireEvent.pointerMove(window, { pointerId: 2, pointerType: 'pen', clientX: 140, clientY: 140 });
    expect(layer.handlers.onMove).toHaveBeenCalled();
    expect(layer.handlers.onGesture).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 2 });
    expect(layer.handlers.onEnd).toHaveBeenCalledTimes(1);
    layer.unmount();
  });
});
