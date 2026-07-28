'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface ActionMenuItem {
  /** Стабильный ключ — он же `data-action-menu-item` для тестов/аналитики. */
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** Разрушающее действие (удаление) — красный текст. */
  destructive?: boolean;
  onSelect: () => void;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** `aria-label` кнопки-триггера: «Действия с сетом «…»». */
  ariaLabel: string;
  className?: string;
}

/** Высота строки меню (44px тап-зона) + вертикальные поля панели — для решения «вверх или вниз». */
const ITEM_HEIGHT_PX = 44;
const MENU_PADDING_PX = 8;
const GAP_PX = 6;

/**
 * Kebab-меню (вертикальное многоточие) с всплывающим списком действий.
 *
 * Панель рендерится порталом в `body` с `position: fixed`: карточки списков живут под
 * `overflow-hidden` (скругление обрезает содержимое), и меню внутри потока было бы срезано.
 * Плата за портал — привязка к координатам триггера, поэтому скролл и resize меню закрывают,
 * а не пытаются его догонять.
 */
export const ActionMenu: React.FC<ActionMenuProps> = ({ items, ariaLabel, className }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const isOpen = rect !== null;

  const close = (returnFocus = true) => {
    setRect(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // Тап мимо меню — закрыть, но фокус в триггер не возвращать: пользователь ушёл в другое место.
      setRect(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    // Панель зафиксирована в координатах экрана — при скролле она «отклеилась» бы от кнопки.
    const onReflow = () => setRect(null);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onReflow, true);
    window.addEventListener('resize', onReflow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onReflow, true);
      window.removeEventListener('resize', onReflow);
    };
  }, [isOpen]);

  const toggle = () => {
    if (isOpen) {
      close(false);
      return;
    }
    const next = triggerRef.current?.getBoundingClientRect() ?? null;
    console.debug('[ActionMenu] open', { items: items.length });
    setRect(next);
  };

  /** Ниже кнопки, а если внизу не помещается — над ней (нижние карточки длинного списка). */
  const menuStyle = (): React.CSSProperties | undefined => {
    if (!rect) return undefined;
    const height = items.length * ITEM_HEIGHT_PX + MENU_PADDING_PX;
    const right = Math.max(GAP_PX, window.innerWidth - rect.right);
    const fitsBelow = rect.bottom + GAP_PX + height <= window.innerHeight;
    return fitsBelow
      ? { top: rect.bottom + GAP_PX, right }
      : { bottom: window.innerHeight - rect.top + GAP_PX, right };
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-action-menu-trigger
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={toggle}
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-app-sm text-app-text-muted transition-transform active:scale-90',
          className
        )}
      >
        <MoreVertical size={20} aria-hidden />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={ariaLabel}
            data-action-menu
            style={menuStyle()}
            className="fixed z-[80] min-w-44 overflow-hidden rounded-app-md border border-app-border bg-app-surface-elevated py-1 shadow-app-lg"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                data-action-menu-item={item.id}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex h-11 w-full items-center gap-2.5 px-4 text-left text-sm font-medium transition-colors active:bg-app-surface-muted',
                  item.destructive ? 'text-app-missed-text' : 'text-app-text'
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

export default ActionMenu;
