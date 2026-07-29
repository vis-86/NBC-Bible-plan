// @vitest-environment jsdom
/**
 * Арбитраж тапов текстового инструмента: один и тот же тап по пустому месту означает
 * три разные вещи в зависимости от состояния слоя. Регрессия из реального использования —
 * панель действий заметки было нечем закрыть: тап мимо открывал ввод новой заметки.
 */
import { useEffect, useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SongInkLayer } from './SongInkLayer';
import { useSongInk } from '../hooks/useSongInk';
import { songLineAnchorProps } from '../lib/inkAnchor';
import type { SongStroke } from '../types';

const NOTE: SongStroke = {
  id: 'note-1',
  tool: 'text',
  anchor: { section: 0, line: 0 },
  points: [[10, 5, 1]],
  color: 'ink',
  width: 15,
  text: 'повтор ×2',
};

function Harness({ initialStrokes }: { initialStrokes: SongStroke[] }) {
  const ink = useSongInk({ initialStrokes, onSave: vi.fn() });
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    entered.current = true;
    ink.enter();
    ink.setTool('text');
  }, [ink]);

  return (
    <SongInkLayer ink={ink} penOnly={false} layoutSignature="test">
      <span {...songLineAnchorProps(0, 0)}>строка песни</span>
    </SongInkLayer>
  );
}

/** Тап по пустому месту листа: слой слушает pointerdown на себе, pointerup — на окне. */
function tapEmptySpace() {
  const host = document.querySelector('[data-song-ink-host]') as HTMLElement;
  act(() => {
    fireEvent.pointerDown(host, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 40 });
  });
}

const input = () => document.querySelector('[data-song-ink-text-input]');
const noteActions = () => document.querySelector('[data-song-ink-note-actions]');

/** Тап по заметке без движения = выделение. */
function tapNote() {
  const note = document.querySelector('[data-song-ink-note]') as HTMLElement;
  act(() => {
    fireEvent.pointerDown(note, { clientX: 10, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 5 });
  });
}

beforeEach(() => {
  // jsdom отдаёт нулевые bounding box'ы, а `collectLineRects` отбрасывает схлопнутые
  // строки — без подмены на листе не было бы ни одного якоря, и заметки не рендерились.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 200,
    bottom: 20,
    width: 200,
    height: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

describe('SongInkLayer — тап текстовым инструментом', () => {
  it('по пустому месту открывает поле ввода', () => {
    render(<Harness initialStrokes={[]} />);
    expect(input()).toBeNull();
    tapEmptySpace();
    expect(input()).not.toBeNull();
  });

  it('при открытом поле завершает ввод, а не открывает второе', () => {
    render(<Harness initialStrokes={[]} />);
    tapEmptySpace();
    expect(input()).not.toBeNull();
    tapEmptySpace();
    // Ровно ноль: раньше тап коммитил первую заметку и тут же открывал вторую.
    expect(document.querySelectorAll('[data-song-ink-text-input]')).toHaveLength(0);
  });

  it('при выделенной заметке снимает выделение и НЕ открывает поле ввода', () => {
    render(<Harness initialStrokes={[NOTE]} />);

    tapNote();
    expect(noteActions()).not.toBeNull();

    tapEmptySpace();
    expect(noteActions()).toBeNull();
    expect(input()).toBeNull();
  });
});

describe('SongInkLayer — заметка и поле ввода стоят в одной точке', () => {
  it('левый край поля ввода стоит в точке тапа — там же, где начнётся заметка', () => {
    render(<Harness initialStrokes={[NOTE]} />);
    tapEmptySpace();
    const field = input() as HTMLElement;
    const note = document.querySelector('[data-song-ink-note]') as HTMLElement;

    // Ни поле, ни заметка не сдвигаются по горизонтали: якорь — левый край строки.
    // Центрирование (`-translate-x-1/2`) уводило бы набираемый текст левее тапа.
    for (const el of [field, note]) {
      expect(el.className).not.toContain('-translate-x-1/2');
      expect(el.className).toContain('-translate-y-1/2');
    }
    expect(field.className).toContain('text-left');
    expect(field.style.left).toBe('40px');
  });

  it('правка существующей заметки берёт её кегль, а не текущий кегль инструмента', () => {
    render(<Harness initialStrokes={[{ ...NOTE, width: 28 }]} />);

    tapNote();
    act(() => {
      fireEvent.click(screen.getByLabelText('Изменить текст'));
    });

    expect((input() as HTMLElement).style.fontSize).toBe('28px');
  });
});
