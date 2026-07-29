'use client';

/**
 * Инлайновое подтверждение разрушающего действия в режиме пометок (M10, §6).
 *
 * Отдельным компонентом, а не модалкой: модалка поверх листа перекрыла бы ровно то,
 * что человек собирается стереть. Живёт рядом со своей кнопкой — «стереть всё» у рельса
 * инструментов, «выйти без сохранения» у плашки режима.
 */
export interface SongInkConfirmProps {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function SongInkConfirm({ text, confirmLabel, onConfirm, onDismiss }: SongInkConfirmProps) {
  return (
    <div
      data-song-ink-ui
      data-song-ink-confirm
      className="pointer-events-auto flex max-w-[16rem] flex-col gap-2 rounded-app-lg border border-app-border bg-app-surface-elevated p-3 shadow-app-md"
    >
      <span className="font-sans text-sm text-app-text">{text}</span>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="h-9 rounded-app-sm px-3 font-sans text-sm text-app-text-secondary hover:bg-app-surface-muted active:scale-95"
        >
          Отмена
        </button>
        <button
          type="button"
          data-song-ink-confirm-accept
          onClick={onConfirm}
          className="h-9 rounded-app-sm bg-app-primary px-3 font-sans text-sm font-medium text-app-text-inverse active:scale-95"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
