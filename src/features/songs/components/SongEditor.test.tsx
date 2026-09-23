// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const createMock = vi.fn();
const updateMock = vi.fn();
let saveError: string | null = null;
vi.mock('../hooks/useSaveSong', () => ({
  useSaveSong: () => ({ create: createMock, update: updateMock, submitting: false, error: saveError }),
}));

import { SongEditor } from './SongEditor';
import { EMPTY_SONG_DRAFT, type SongEditorDraft } from '../lib/songEditorDraft';

const EXISTING: SongEditorDraft = {
  title: 'Велик Господь',
  key: 'Am',
  tempo: '72',
  time: '4/4',
  content: '{comment: Куплет}\n[Am]Слово Твоё',
};

const PASTED = ['Свят Господь', '', 'Куплет 1:', 'G         D', 'Свят Господь'].join('\n');

function saveButton(container: Element): HTMLButtonElement {
  return container.querySelector('[data-song-editor-save]') as HTMLButtonElement;
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

// jsdom не умеет геометрию Range: все точки вставки в (0,0), тап ставит курсор в начало строки.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
}

describe('SongEditor', () => {
  beforeEach(() => {
    saveError = null;
    setOnline(true);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('новая песня: вставка разбирается, название подставляется, предпросмотр рисует аккорды', () => {
    const { container } = render(<SongEditor songId={null} initial={EMPTY_SONG_DRAFT} onSaved={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(container.querySelector('[data-song-editor-paste-input]') as HTMLElement, {
      target: { value: PASTED },
    });

    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Свят Господь');
    expect(container.querySelector('[data-song-editor-paste-summary]')?.textContent).toContain('аккордов 2');
    expect(container.querySelector('[data-song-editor-preview]')?.textContent).toContain('G');
  });

  it('сохранение новой песни отправляет готовый ChordPro и отдаёт id наружу', async () => {
    createMock.mockResolvedValue('42');
    const onSaved = vi.fn();
    const { container } = render(<SongEditor songId={null} initial={EMPTY_SONG_DRAFT} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(container.querySelector('[data-song-editor-paste-input]') as HTMLElement, {
      target: { value: PASTED },
    });

    await act(async () => {
      fireEvent.click(saveButton(container));
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Свят Господь', content: expect.stringContaining('[G]'), songKey: null })
    );
    expect(onSaved).toHaveBeenCalledWith('42');
  });

  it('невалидная форма не уходит на сервер и показывает ошибки', async () => {
    const { container } = render(<SongEditor songId={null} initial={EMPTY_SONG_DRAFT} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Тональность'), { target: { value: 'Ля' } });

    await act(async () => {
      fireEvent.click(saveButton(container));
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(screen.getByText('Введите название')).toBeTruthy();
    expect(screen.getByText('Тональность латиницей: A, F#m, Bb')).toBeTruthy();
    expect(screen.getByText('Добавьте текст песни')).toBeTruthy();
  });

  it('правка: без изменений сохранять нечего, после правки уходит только изменённое', async () => {
    updateMock.mockResolvedValue('7');
    const { container } = render(<SongEditor songId="7" initial={EXISTING} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(saveButton(container).disabled).toBe(true);
    // Правка существующей песни открывается на холсте аккордов, не на пустой вставке.
    expect(container.querySelector('[data-song-chord-canvas]')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Темп'), { target: { value: '80' } });
    expect(saveButton(container).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(saveButton(container));
    });

    expect(updateMock).toHaveBeenCalledWith('7', { tempo: 80 });
  });

  it('очищенная вставка возвращает исходный текст существующей песни', () => {
    const { container } = render(<SongEditor songId="7" initial={EXISTING} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText('Вставить'));
    const input = container.querySelector('[data-song-editor-paste-input]') as HTMLElement;

    fireEvent.change(input, { target: { value: PASTED } });
    fireEvent.change(input, { target: { value: '' } });

    expect(saveButton(container).disabled).toBe(true);
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Велик Господь');
  });

  it('офлайн: кнопка неактивна и видна причина', () => {
    setOnline(false);
    const { container } = render(<SongEditor songId="7" initial={EXISTING} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Темп'), { target: { value: '80' } });

    expect(saveButton(container).disabled).toBe(true);
    expect(container.querySelector('[data-song-editor-offline]')).toBeTruthy();
  });

  it('ошибка записи показывается пользователю', () => {
    saveError = 'Недостаточно прав для правки песен.';
    render(<SongEditor songId="7" initial={EXISTING} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe('Недостаточно прав для правки песен.');
  });

  it('выход с несохранёнными изменениями спрашивает подтверждение', () => {
    const onCancel = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SongEditor songId="7" initial={EXISTING} onSaved={vi.fn()} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Темп'), { target: { value: '80' } });

    fireEvent.click(screen.getByLabelText('Выйти из редактора'));
    expect(confirm).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Выйти из редактора'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SongEditor — холст «Аккорды»', () => {
  const SONG: SongEditorDraft = {
    ...EXISTING,
    content: ['{comment: Куплет}', '[Am]Слово Твоё', '', 'Свет'].join('\n'),
  };

  function source(container: Element): string {
    fireEvent.click(screen.getByText('Исходник'));
    return (container.querySelector('[data-song-editor-source-input]') as HTMLTextAreaElement).value;
  }

  function tapLine(container: Element, index: number) {
    const line = container.querySelector(`[data-song-chord-canvas-line="${index}"] span`) as HTMLElement;
    fireEvent.click(line);
  }

  beforeEach(() => {
    setOnline(true);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('без курсора ступени неактивны, тап по строке ставит курсор', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const degrees = container.querySelector('[data-song-chord-keyboard-degrees]') as HTMLElement;
    expect((within(degrees).getByText('C').closest('button') as HTMLButtonElement).disabled).toBe(true);

    tapLine(container, 3);

    expect(container.querySelector('[data-song-chord-canvas-caret]')).toBeTruthy();
    expect((within(degrees).getByText('C').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('ступень ставит аккорд над курсором и выбирает его, модификатор правит на месте', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    tapLine(container, 3);
    const degrees = container.querySelector('[data-song-chord-keyboard-degrees]') as HTMLElement;
    fireEvent.click(within(degrees).getByText('G'));

    expect(container.querySelector('[data-song-chord-keyboard-hint]')?.textContent).toContain('Выбран G');
    fireEvent.click(screen.getByRole('button', { name: '7' }));

    expect(source(container).split('\n')[3]).toBe('[G7]Свет');
  });

  it('перенос выбранного аккорда строкой ниже и удаление', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const chip = container.querySelector('[data-song-chord-canvas-line="1"] [data-song-chord-canvas-chip]') as HTMLElement;
    fireEvent.click(chip);
    expect((screen.getByLabelText('Перенести строкой выше') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Перенести строкой ниже'));
    fireEvent.click(screen.getByLabelText('Убрать аккорд'));

    expect(source(container)).toBe(['{comment: Куплет}', 'Слово Твоё', '', 'Свет'].join('\n'));
  });

  it('«Отменить» возвращает шаг назад, и сохранять становится нечего', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-song-chord-canvas-chip]') as HTMLElement);
    fireEvent.click(screen.getByLabelText('Убрать аккорд'));
    expect(saveButton(container).disabled).toBe(false);

    fireEvent.click(container.querySelector('[data-song-chord-keyboard-undo]') as HTMLElement);

    expect(saveButton(container).disabled).toBe(true);
    expect(container.querySelector('[data-song-chord-keyboard-undo]')).toBeNull();
  });

  it('бас: выбор ноты дописывает /бас, повторное нажатие снимает', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(container.querySelector('[data-song-chord-canvas-chip]') as HTMLElement);
    fireEvent.click(screen.getByText('/бас'));
    fireEvent.click(within(container.querySelector('[data-song-chord-keyboard-bass]') as HTMLElement).getByText('/G'));
    expect(screen.getByText('/G', { selector: '[data-song-chord-keyboard-mods] button' })).toBeTruthy();

    fireEvent.click(screen.getByText('/G', { selector: '[data-song-chord-keyboard-mods] button' }));

    expect(source(container).split('\n')[1]).toBe('[Am]Слово Твоё');
  });

  it('свой аккорд из «Ещё»: русское H пишется как B', () => {
    const { container } = render(<SongEditor songId="7" initial={SONG} onSaved={vi.fn()} onCancel={vi.fn()} />);
    tapLine(container, 3);
    fireEvent.click(screen.getByText('Ещё'));
    fireEvent.change(screen.getByLabelText('Свой аккорд'), { target: { value: 'H7' } });
    fireEvent.click(screen.getByText('Поставить'));

    expect(source(container).split('\n')[3]).toBe('[B7]Свет');
  });
});

describe('SongEditor — знаки в цепочке аккордов', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('тактовая черта выбирается, но модификаторы и бас к ней неприменимы', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const song: SongEditorDraft = { ...EXISTING, content: '[G][|][C]' };
    const { container } = render(<SongEditor songId="7" initial={song} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(container.querySelectorAll('[data-song-chord-canvas-chip]')[1] as HTMLElement);

    expect(container.querySelector('[data-song-chord-keyboard-hint]')?.textContent).toBe('Выбран |');
    const mods = container.querySelector('[data-song-chord-keyboard-mods]') as HTMLElement;
    expect(Array.from(mods.querySelectorAll('button')).every((b) => b.disabled)).toBe(true);
    expect((screen.getByLabelText('Убрать аккорд') as HTMLButtonElement).disabled).toBe(false);
  });
});
