// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

const { createMock, updateMock } = vi.hoisted(() => ({ createMock: vi.fn(), updateMock: vi.fn() }));
vi.mock('@/shared/services/api/endpoints', () => ({
  setlistsApi: { create: createMock, update: updateMock },
}));

vi.mock('@/shared/offline/db', () => ({
  getDB: async () => ({ delete: vi.fn() }),
}));

import { NameSetlistSheet } from './NameSetlistSheet';

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('NameSetlistSheet', () => {
  beforeEach(() => {
    setOnline(true);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('сабмит вызывает create с правильным порядком songIds', async () => {
    createMock.mockResolvedValue({ id: 'new-id' });
    const onSuccess = vi.fn();
    const { container } = render(
      <NameSetlistSheet
        isOpen={true}
        onClose={vi.fn()}
        initialTitle=""
        initialDate={null}
        songIds={[3, 1, 2]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement, {
      target: { value: 'Воскресное' },
    });
    fireEvent.click(container.querySelector('[data-setlist-builder-submit]') as HTMLElement);

    await vi.waitFor(() => expect(createMock).toHaveBeenCalledWith({ title: 'Воскресное', date: null, songIds: [3, 1, 2] }));
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('new-id'));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('офлайн блокирует сабмит (кнопка disabled + предупреждение)', () => {
    setOnline(false);
    const { container } = render(
      <NameSetlistSheet
        isOpen={true}
        onClose={vi.fn()}
        initialTitle="Название"
        initialDate={null}
        songIds={[1]}
        onSuccess={vi.fn()}
      />
    );

    const submitBtn = container.querySelector('[data-setlist-builder-submit]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(container.querySelector('[data-setlist-builder-offline-warning]')).toBeTruthy();
    fireEvent.click(submitBtn);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('ошибка сервера показывает retry и не чистит введённые данные', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    createMock.mockResolvedValueOnce({ id: 'ok-id' });
    const onSuccess = vi.fn();
    const { container, findByText } = render(
      <NameSetlistSheet
        isOpen={true}
        onClose={vi.fn()}
        initialTitle="Молодёжка"
        initialDate={null}
        songIds={[1]}
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(container.querySelector('[data-setlist-builder-submit]') as HTMLElement);
    await findByText('network down');

    // Черновик не теряется — заголовок остаётся в поле.
    expect((container.querySelector('[data-setlist-builder-title-input]') as HTMLInputElement).value).toBe(
      'Молодёжка'
    );

    fireEvent.click(container.querySelector('[data-setlist-builder-retry]') as HTMLElement);
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('ok-id'));
  });

  it('редактирование (editingId задан) вызывает update, а не create', async () => {
    updateMock.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const { container } = render(
      <NameSetlistSheet
        isOpen={true}
        onClose={vi.fn()}
        initialTitle="Существующий"
        initialDate="2026-08-01"
        songIds={[2, 1]}
        editingId="s1"
        onSuccess={onSuccess}
      />
    );

    fireEvent.click(container.querySelector('[data-setlist-builder-submit]') as HTMLElement);

    await vi.waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith('s1', { title: 'Существующий', date: '2026-08-01', songIds: [2, 1] })
    );
    expect(createMock).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith('s1'));
  });
});
