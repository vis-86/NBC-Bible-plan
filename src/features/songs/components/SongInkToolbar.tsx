'use client';

/**
 * Панель режима рукописных пометок (M10, §7).
 *
 * Нижняя док-панель, а не стек у правого края: на репетиции инструмент меняют
 * большим пальцем, и нижняя кромка — единственная зона, достижимая на телефоне
 * без перехвата аппарата. Пока панель открыта, `SongToolStack` скрыт целиком —
 * контракт «активный инструмент забирает край» уже описан в `SongToolStack.tsx`.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Eraser, Highlighter, Pen, Trash2, Type, Undo2, X } from 'lucide-react';
import { RangeSlider } from '@/shared/components/ui/RangeSlider';
import { cn } from '@/shared/utils/cn';
import { INK_COLORS, INK_TOOL_LABELS, INK_WIDTH_RANGE, type InkToolChoice } from '../lib/inkTools';
import type { SongInkTool } from '../types';

export interface SongInkToolbarProps {
  tool: InkToolChoice;
  color: string;
  width: number;
  canUndo: boolean;
  dirty: boolean;
  hasStrokes: boolean;
  /** Текущий масштаб листа; 1 — панель зума не показывает. */
  zoom: number;
  onResetZoom: () => void;
  onToolChange: (tool: InkToolChoice) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
  onDone: () => void;
  onCancel: () => void;
}

const TOOL_ICONS: Record<InkToolChoice, typeof Pen> = {
  pen: Pen,
  highlighter: Highlighter,
  arrow: ArrowUpRight,
  text: Type,
  eraser: Eraser,
};

const TOOL_ORDER: InkToolChoice[] = ['pen', 'highlighter', 'arrow', 'text', 'eraser'];

/** Подсказка о двухпальцевом жесте: сам его никто не найдёт. */
const HINT_TEXT = 'Два пальца — прокрутка и масштаб';
const HINT_MS = 3500;

export function SongInkToolbar({
  tool,
  color,
  width,
  canUndo,
  dirty,
  hasStrokes,
  zoom,
  onResetZoom,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onClearAll,
  onDone,
  onCancel,
}: SongInkToolbarProps) {
  const [hintVisible, setHintVisible] = useState(true);
  /** Подтверждения инлайновые: модалка поверх листа перекрыла бы то, что стирают. */
  const [confirming, setConfirming] = useState<'clear' | 'cancel' | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  const widthTarget: SongInkTool = tool === 'eraser' ? 'pen' : tool;
  const range = INK_WIDTH_RANGE[widthTarget];
  const showsInkStyle = tool !== 'eraser';

  const handleCancel = () => {
    // Подтверждаем только когда есть что терять.
    if (!dirty) onCancel();
    else setConfirming('cancel');
  };

  return (
    <div
      data-song-ink-ui
      data-song-ink-toolbar
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-app-border bg-app-surface-elevated px-3 pt-2 pb-safe shadow-app-md"
    >
      {(hintVisible || zoom !== 1) && (
        <div className="flex items-center justify-center gap-2 text-xs text-app-text-muted">
          {hintVisible && <span data-song-ink-hint>{HINT_TEXT}</span>}
          {zoom !== 1 && (
            <button
              type="button"
              data-song-ink-zoom-reset
              onClick={onResetZoom}
              className="rounded-app-sm bg-app-surface-muted px-2 py-0.5 tabular-nums text-app-text-secondary active:scale-95"
            >
              ×{zoom.toFixed(1)} · сбросить
            </button>
          )}
        </div>
      )}

      {confirming ? (
        <ConfirmRow
          text={confirming === 'clear' ? 'Стереть все пометки?' : 'Выйти без сохранения?'}
          confirmLabel={confirming === 'clear' ? 'Стереть' : 'Выйти'}
          onConfirm={() => {
            if (confirming === 'clear') onClearAll();
            else onCancel();
            setConfirming(null);
          }}
          onDismiss={() => setConfirming(null)}
        />
      ) : (
        <>
          {showsInkStyle && (
            <div className="flex items-center gap-2">
              <div data-song-ink-palette className="flex flex-1 items-center justify-between gap-1">
                {INK_COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-label={option.label}
                    title={option.label}
                    aria-pressed={color === option.value}
                    onClick={() => onColorChange(option.value)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90',
                      color === option.value && 'ring-2 ring-app-primary ring-offset-2 ring-offset-app-surface-elevated'
                    )}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-app-border"
                      style={{ backgroundColor: option.swatch }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          {showsInkStyle && (
            <div className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs text-app-text-muted">
                {tool === 'text' ? 'Размер' : 'Толщина'}
              </span>
              <RangeSlider
                data-song-ink-width
                aria-label={tool === 'text' ? 'Размер текста' : 'Толщина линии'}
                value={width}
                min={range.min}
                max={range.max}
                onChange={onWidthChange}
                className="flex-1"
              />
              {/* Живой образец: подобрать толщину по числу невозможно. */}
              <span
                aria-hidden
                className="h-6 w-6 shrink-0 rounded-full bg-app-text"
                style={{
                  transform: `scale(${Math.min(1, Math.max(0.15, width / range.max))})`,
                }}
              />
            </div>
          )}

          <div className="flex items-center gap-1">
            <div data-song-ink-tools className="flex flex-1 items-center gap-0.5">
              {TOOL_ORDER.map((item) => {
                const Icon = TOOL_ICONS[item];
                const activeTool = tool === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-label={INK_TOOL_LABELS[item]}
                    title={INK_TOOL_LABELS[item]}
                    aria-pressed={activeTool}
                    data-song-ink-tool={item}
                    onClick={() => onToolChange(item)}
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-app-sm transition-colors active:scale-95',
                      activeTool
                        ? 'bg-app-primary text-app-text-inverse'
                        : 'text-app-text-secondary hover:bg-app-surface-muted'
                    )}
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </div>

            <span className="mx-1 h-6 w-px bg-app-border" aria-hidden />

            <IconButton label="Отменить действие" onClick={onUndo} disabled={!canUndo}>
              <Undo2 size={20} />
            </IconButton>
            <IconButton
              label="Стереть все пометки"
              onClick={() => setConfirming('clear')}
              disabled={!hasStrokes}
              destructive
            >
              <Trash2 size={20} />
            </IconButton>
            <IconButton label="Выйти без сохранения" onClick={handleCancel}>
              <X size={20} />
            </IconButton>
            <button
              type="button"
              data-song-ink-done
              onClick={onDone}
              className="ml-1 flex h-11 items-center gap-1.5 rounded-app-sm bg-app-success px-3 font-sans text-sm font-medium text-app-text-inverse transition-transform active:scale-95"
            >
              <Check size={18} />
              Готово
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-app-sm transition-colors active:scale-95 disabled:opacity-35',
        destructive ? 'text-app-primary hover:bg-app-missed' : 'text-app-text-secondary hover:bg-app-surface-muted'
      )}
    >
      {children}
    </button>
  );
}

function ConfirmRow({
  text,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div data-song-ink-confirm className="flex items-center gap-2 py-1">
      <span className="flex-1 text-sm text-app-text">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="h-10 rounded-app-sm px-3 text-sm text-app-text-secondary hover:bg-app-surface-muted active:scale-95"
      >
        Отмена
      </button>
      <button
        type="button"
        data-song-ink-confirm-accept
        onClick={onConfirm}
        className="h-10 rounded-app-sm bg-app-primary px-3 text-sm font-medium text-app-text-inverse active:scale-95"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
