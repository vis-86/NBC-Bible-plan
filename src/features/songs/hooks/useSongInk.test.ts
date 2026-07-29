// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSongInk } from './useSongInk';
import { indexLineRects, type LineRect } from '../lib/inkGeometry';
import type { SongStroke } from '../types';

const LINES: LineRect[] = [
  { section: 0, line: 0, x: 0, y: 0, width: 200, height: 20 },
  { section: 0, line: 1, x: 0, y: 40, width: 200, height: 20 },
];

const EMPTY: SongStroke[] = [];

function setup(initial: SongStroke[] = EMPTY, onSave = vi.fn()) {
  const view = renderHook(({ strokes }) => useSongInk({ initialStrokes: strokes, onSave }), {
    initialProps: { strokes: initial },
  });
  return { ...view, onSave };
}

/** Рисует штрих из двух точек и коммитит его. */
function draw(result: { current: ReturnType<typeof useSongInk> }, x = 10, y = 45) {
  act(() => result.current.beginDraft({ x, y, pressure: 0.5 }));
  act(() => result.current.extendDraft({ x: x + 30, y, pressure: 0.5 }));
  act(() => result.current.commitDraft(LINES));
}

beforeEach(() => vi.clearAllMocks());

describe('черновик и коммит', () => {
  it('штрих якорится к ближайшей строке и хранит координаты относительно неё', () => {
    const { result } = setup();
    draw(result, 10, 45);

    expect(result.current.strokes).toHaveLength(1);
    const stroke = result.current.strokes[0];
    expect(stroke.anchor).toEqual({ section: 0, line: 1 });
    expect(stroke.points[0]).toEqual([10, 5, 0.5]);
  });

  it('у стрелки ровно две точки: остриё тянется, а не копит след', () => {
    const { result } = setup();
    act(() => result.current.setTool('arrow'));
    act(() => result.current.beginDraft({ x: 0, y: 5, pressure: 0.5 }));
    act(() => result.current.extendDraft({ x: 50, y: 5, pressure: 0.5 }));
    act(() => result.current.extendDraft({ x: 90, y: 5, pressure: 0.5 }));

    expect(result.current.draft?.points).toEqual([
      { x: 0, y: 5, pressure: 0.5 },
      { x: 90, y: 5, pressure: 0.5 },
    ]);
  });

  it('тап стрелкой без протяжки не создаёт запись', () => {
    const { result } = setup();
    act(() => result.current.setTool('arrow'));
    act(() => result.current.beginDraft({ x: 0, y: 5, pressure: 0.5 }));
    act(() => result.current.commitDraft(LINES));
    expect(result.current.strokes).toHaveLength(0);
  });

  it('нет якорных строк — штрих не создаётся, а не падает', () => {
    const { result } = setup();
    act(() => result.current.beginDraft({ x: 1, y: 1, pressure: 0.5 }));
    act(() => result.current.commitDraft([]));
    expect(result.current.strokes).toHaveLength(0);
  });
});

describe('ластик', () => {
  it('стирает штрих целиком по попаданию', () => {
    const { result } = setup();
    draw(result, 10, 45);
    act(() => {
      result.current.eraseAt({ x: 25, y: 45, pressure: 0.5 }, indexLineRects(LINES));
    });
    expect(result.current.strokes).toHaveLength(0);
  });

  it('промах ничего не стирает', () => {
    const { result } = setup();
    draw(result, 10, 45);
    act(() => {
      result.current.eraseAt({ x: 190, y: 5, pressure: 0.5 }, indexLineRects(LINES));
    });
    expect(result.current.strokes).toHaveLength(1);
  });
});

describe('undo', () => {
  it('откатывает добавление штриха', () => {
    const { result } = setup();
    draw(result);
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.strokes).toHaveLength(0);
  });

  // Ловушка: `strokes.slice()` копирует массив, но не объекты в нём. Для штрихов это
  // не всплывало (их только добавляют и удаляют), и вылезло ровно на заметках.
  it('поворот заметки → undo возвращает горизонтальную', () => {
    const { result } = setup();
    act(() => result.current.addTextNote({ x: 10, y: 45, pressure: 0.5 }, LINES, 'повтор'));
    const id = result.current.strokes[0].id;

    act(() => result.current.updateStroke(id, { vertical: true }));
    expect(result.current.strokes[0].vertical).toBe(true);

    act(() => result.current.undo());
    expect(result.current.strokes[0].vertical).toBeUndefined();
  });

  it('перетаскивание заметки → undo возвращает исходную позицию', () => {
    const { result } = setup();
    act(() => result.current.addTextNote({ x: 10, y: 45, pressure: 0.5 }, LINES, 'повтор'));
    const before = [...result.current.strokes[0].points[0]];
    const id = result.current.strokes[0].id;

    act(() => result.current.moveStroke(id, { x: 120, y: 5, pressure: 0.5 }, LINES));
    expect(result.current.strokes[0].anchor).toEqual({ section: 0, line: 0 });

    act(() => result.current.undo());
    expect(result.current.strokes[0].points[0]).toEqual(before);
    expect(result.current.strokes[0].anchor).toEqual({ section: 0, line: 1 });
  });

  it('правка текста → undo возвращает прежний текст', () => {
    const { result } = setup();
    act(() => result.current.addTextNote({ x: 10, y: 45, pressure: 0.5 }, LINES, 'было'));
    const id = result.current.strokes[0].id;

    act(() => result.current.updateStroke(id, { text: 'стало' }));
    act(() => result.current.undo());
    expect(result.current.strokes[0].text).toBe('было');
  });
});

describe('заметки', () => {
  it('пустой текст записи не создаёт', () => {
    const { result } = setup();
    act(() => result.current.addTextNote({ x: 10, y: 45, pressure: 0.5 }, LINES, '   '));
    expect(result.current.strokes).toHaveLength(0);
  });

  it('перетаскивание ПЕРЕПРИВЯЗЫВАЕТ заметку к ближайшей строке', () => {
    const { result } = setup();
    act(() => result.current.addTextNote({ x: 10, y: 45, pressure: 0.5 }, LINES, 'note'));
    const id = result.current.strokes[0].id;
    act(() => result.current.moveStroke(id, { x: 10, y: 5, pressure: 0.5 }, LINES));
    expect(result.current.strokes[0].anchor).toEqual({ section: 0, line: 0 });
  });
});

describe('вход и выход', () => {
  it('«Готово» сохраняет правки', () => {
    const onSave = vi.fn();
    const { result } = setup(EMPTY, onSave);
    act(() => result.current.enter());
    draw(result);
    act(() => result.current.exit(true));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(1);
    expect(result.current.active).toBe(false);
  });

  it('«Отменить» откатывает к сохранённому состоянию и не пишет', () => {
    const onSave = vi.fn();
    const initial: SongStroke[] = [
      { id: 'a', tool: 'pen', anchor: { section: 0, line: 0 }, points: [[1, 1, 1]], color: '#000', width: 3 },
    ];
    const { result } = setup(initial, onSave);
    act(() => result.current.enter());
    draw(result);
    expect(result.current.strokes).toHaveLength(2);

    act(() => result.current.exit(false));
    expect(onSave).not.toHaveBeenCalled();
    expect(result.current.strokes).toHaveLength(1);
  });

  it('без правок «Готово» не дёргает запись впустую', () => {
    const onSave = vi.fn();
    const { result } = setup(EMPTY, onSave);
    act(() => result.current.enter());
    act(() => result.current.exit(true));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('«очистить всё» откатывается через undo', () => {
    const { result } = setup();
    draw(result);
    act(() => result.current.clearAll());
    expect(result.current.strokes).toHaveLength(0);
    act(() => result.current.undo());
    expect(result.current.strokes).toHaveLength(1);
  });
});

describe('instant annotation', () => {
  it('пауза бездействия сохраняет и выходит', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const view = renderHook(() =>
      useSongInk({ initialStrokes: EMPTY, onSave, instantAnnotation: true })
    );
    act(() => view.result.current.enter());
    draw(view.result);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(view.result.current.active).toBe(false);
    vi.useRealTimers();
  });

  it('активность сбрасывает таймер — режим не закрывается посреди работы', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const view = renderHook(() =>
      useSongInk({ initialStrokes: EMPTY, onSave, instantAnnotation: true })
    );
    act(() => view.result.current.enter());
    draw(view.result);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => view.result.current.noteActivity());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(view.result.current.active).toBe(true);
    vi.useRealTimers();
  });
});

describe('правки выделенной заметки', () => {
  const NOTE: SongStroke = {
    id: 'note-1',
    tool: 'text',
    anchor: { section: 0, line: 0 },
    points: [[10, 5, 1]],
    color: 'ink',
    width: 15,
    text: 'повтор ×2',
  };

  it('смена цвета при выделении красит саму заметку, а не только будущие пометки', () => {
    const { result } = setup([NOTE]);
    act(() => result.current.enter());
    act(() => result.current.setTool('text'));
    act(() => result.current.setSelectedId('note-1'));

    act(() => result.current.setColor('#dc2626'));

    expect(result.current.strokes[0].color).toBe('#dc2626');
    // Цвет инструмента тоже меняется: следующая заметка наберётся тем же цветом.
    expect(result.current.color).toBe('#dc2626');
    expect(result.current.selectedStroke?.color).toBe('#dc2626');
  });

  it('смена кегля при выделении меняет размер самой заметки', () => {
    const { result } = setup([NOTE]);
    act(() => result.current.enter());
    act(() => result.current.setTool('text'));
    act(() => result.current.setSelectedId('note-1'));

    act(() => result.current.setWidth(26));

    expect(result.current.strokes[0].width).toBe(26);
  });

  it('без выделения цвет меняет только инструмент', () => {
    const { result } = setup([NOTE]);
    act(() => result.current.enter());
    act(() => result.current.setColor('#16a34a'));

    expect(result.current.strokes[0].color).toBe('ink');
    expect(result.current.color).toBe('#16a34a');
  });

  it('правку заметки можно откатить одним undo', () => {
    const { result } = setup([NOTE]);
    act(() => result.current.enter());
    act(() => result.current.setTool('text'));
    act(() => result.current.setSelectedId('note-1'));
    act(() => result.current.setColor('#dc2626'));

    act(() => result.current.undo());

    expect(result.current.strokes[0].color).toBe('ink');
  });
});

describe('цвет пометок', () => {
  it('стартует с переданного цвета и возвращает выбор наружу', () => {
    // Сессия рисования живёт ровно столько, сколько открыта песня, поэтому цвет
    // приходит из настроек просмотра и туда же возвращается — иначе он терялся бы
    // при переходе к следующей песне сета.
    const onColorChange = vi.fn();
    const { result } = renderHook(() =>
      useSongInk({ initialStrokes: EMPTY, onSave: vi.fn(), initialColor: '#dc2626', onColorChange })
    );

    expect(result.current.color).toBe('#dc2626');

    act(() => result.current.setColor('#0284c7'));

    expect(result.current.color).toBe('#0284c7');
    expect(onColorChange).toHaveBeenCalledWith('#0284c7');
  });
});
