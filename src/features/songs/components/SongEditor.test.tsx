// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

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
    // Правка существующей песни открывается на исходнике, не на пустой вставке.
    expect(container.querySelector('[data-song-editor-source-input]')).toBeTruthy();

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
