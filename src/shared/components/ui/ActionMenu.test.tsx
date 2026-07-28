// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';

function makeItems(onEdit = vi.fn(), onDelete = vi.fn()): ActionMenuItem[] {
  return [
    { id: 'edit', label: 'Изменить', onSelect: onEdit },
    { id: 'delete', label: 'Удалить', destructive: true, onSelect: onDelete },
  ];
}

function open(container: HTMLElement) {
  fireEvent.click(container.querySelector('[data-action-menu-trigger]') as HTMLElement);
}

describe('ActionMenu', () => {
  // Панель живёт порталом в body, но снимается вместе с компонентом — авто-cleanup RTL
  // её убирает, ручная чистка body только ломала бы размонтирование.
  afterEach(() => vi.clearAllMocks());

  it('панель появляется только после клика по многоточию', () => {
    const { container } = render(<ActionMenu items={makeItems()} ariaLabel="Действия" />);
    expect(document.querySelector('[data-action-menu]')).toBeNull();

    open(container);

    expect(document.querySelector('[data-action-menu]')).toBeTruthy();
    expect(document.querySelectorAll('[data-action-menu-item]')).toHaveLength(2);
  });

  it('выбор пункта вызывает onSelect и закрывает меню', () => {
    const onEdit = vi.fn();
    const { container } = render(<ActionMenu items={makeItems(onEdit)} ariaLabel="Действия" />);
    open(container);

    fireEvent.click(document.querySelector('[data-action-menu-item="edit"]') as HTMLElement);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-action-menu]')).toBeNull();
  });

  it('повторный клик по триггеру закрывает меню', () => {
    const { container } = render(<ActionMenu items={makeItems()} ariaLabel="Действия" />);
    open(container);
    open(container);

    expect(document.querySelector('[data-action-menu]')).toBeNull();
  });

  it('тап мимо меню закрывает его, действие не вызывается', () => {
    const onEdit = vi.fn();
    const { container } = render(<ActionMenu items={makeItems(onEdit)} ariaLabel="Действия" />);
    open(container);

    fireEvent.pointerDown(document.body);

    expect(document.querySelector('[data-action-menu]')).toBeNull();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('Escape закрывает меню и возвращает фокус на триггер', () => {
    const { container } = render(<ActionMenu items={makeItems()} ariaLabel="Действия" />);
    const trigger = container.querySelector('[data-action-menu-trigger]') as HTMLElement;
    open(container);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelector('[data-action-menu]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // Панель зафиксирована в координатах экрана — при скролле она отклеилась бы от кнопки.
  it('скролл закрывает меню', () => {
    const { container } = render(<ActionMenu items={makeItems()} ariaLabel="Действия" />);
    open(container);

    fireEvent.scroll(window);

    expect(document.querySelector('[data-action-menu]')).toBeNull();
  });

  it('aria-expanded отражает состояние, у панели role=menu', () => {
    const { container } = render(<ActionMenu items={makeItems()} ariaLabel="Действия с сетом" />);
    const trigger = container.querySelector('[data-action-menu-trigger]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    open(container);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-action-menu]')?.getAttribute('role')).toBe('menu');
  });
});
