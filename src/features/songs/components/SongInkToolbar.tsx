'use client';

/**
 * Нижняя панель режима рукописных пометок (M10, §6).
 *
 * Единственная поверхность режима: шапка песни на входе уезжает, и весь экран над
 * панелью — холст. Прежняя раскладка (вертикальный рельс справа + плашка сверху)
 * перекрывала лист с двух сторон: рельс стоял ровно там, где на планшете тянется
 * правая колонка, а плашка требовала отступа над первыми строками.
 *
 * Порядок слева направо: стиль (образец цвета) → инструменты → история → масштаб и
 * выходы. «Готово» — крайняя правая, «Отменить» (выйти без сохранения) отделена от
 * ластика разделителем и подтверждается, если есть что терять. На узком экране выходы
 * переносятся отдельной строкой над инструментами: в одну строку телефона десять
 * кнопок с нормальной зоной касания не помещаются.
 *
 * Карточка стиля и подтверждения всплывают НАД панелью — сиблингом в колонке, а не
 * absolute-смещением: их позиция не зависит от ширины панели.
 */
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Eraser, Highlighter, Pen, Trash2, Type, Undo2 } from 'lucide-react';
import { RangeSlider } from '@/shared/components/ui/RangeSlider';
import { cn } from '@/shared/utils/cn';
import {
  INK_COLORS,
  INK_TEXT_SIZES,
  INK_TOOL_LABELS,
  INK_WIDTH_RANGE,
  inkSwatchColor,
  nearestTextSize,
  type InkToolChoice,
} from '../lib/inkTools';
import type { SongInkTool } from '../types';
import { SongInkConfirm } from './SongInkConfirm';

export interface SongInkToolbarProps {
  tool: InkToolChoice;
  color: string;
  width: number;
  canUndo: boolean;
  hasStrokes: boolean;
  /** Есть несохранённые правки — выход без сохранения подтверждаем. */
  dirty: boolean;
  /** Текущий масштаб листа; 1 — чип масштаба не показываем. */
  zoom: number;
  onToolChange: (tool: InkToolChoice) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
  onResetZoom: () => void;
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

/**
 * Сколько места снизу занимает панель в самой высокой раскладке (две строки на
 * телефоне) вместе с полем до края. Страница отдаёт его нижним отступом листа, чтобы
 * последние строки можно было поднять над панелью. Запас безвреден: отступ лишь
 * удлиняет прокрутку, высоту страницы-листа он не меняет.
 */
export const INK_TOOLBAR_RESERVE_PX = 128;

/** Подсказка о двухпальцевом жесте: сам его никто не найдёт. */
const HINT_TEXT = 'Два пальца — прокрутка и масштаб';
const HINT_MS = 3500;

type Popup = 'style' | 'clear' | 'cancel' | null;

export function SongInkToolbar({
  tool,
  color,
  width,
  canUndo,
  hasStrokes,
  dirty,
  zoom,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onClearAll,
  onResetZoom,
  onDone,
  onCancel,
}: SongInkToolbarProps) {
  const [popup, setPopup] = useState<Popup>(null);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  // У ластика нет ни цвета, ни толщины — карточку стиля показывать нечему.
  const stylable = tool !== 'eraser';
  const widthTarget: SongInkTool = tool === 'eraser' ? 'pen' : tool;
  const range = INK_WIDTH_RANGE[widthTarget];
  const styleOpen = popup === 'style' && stylable;

  const handleToolChange = (next: InkToolChoice) => {
    if (next === 'eraser' && popup === 'style') setPopup(null);
    onToolChange(next);
  };

  const handleCancel = () => {
    // Подтверждаем только когда есть что терять.
    if (dirty) setPopup('cancel');
    else onCancel();
  };

  return (
    <div
      data-song-ink-ui
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-2 pb-3 pb-safe"
    >
      {popup === 'clear' ? (
        <SongInkConfirm
          text="Стереть все пометки?"
          confirmLabel="Стереть"
          onConfirm={() => {
            setPopup(null);
            onClearAll();
          }}
          onDismiss={() => setPopup(null)}
        />
      ) : popup === 'cancel' ? (
        <SongInkConfirm
          text="Выйти без сохранения?"
          confirmLabel="Выйти"
          onConfirm={() => {
            setPopup(null);
            onCancel();
          }}
          onDismiss={() => setPopup(null)}
        />
      ) : styleOpen ? (
        <div
          data-song-ink-style
          className="pointer-events-auto w-72 max-w-full rounded-app-lg border border-app-border bg-app-surface-elevated p-3 shadow-app-md"
        >
          <SectionLabel>Цвет</SectionLabel>
          <div data-song-ink-palette className="grid grid-cols-4 gap-2">
            {INK_COLORS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                title={option.label}
                aria-pressed={color === option.value}
                onClick={() => onColorChange(option.value)}
                className={cn(
                  'flex h-10 items-center justify-center rounded-app-sm transition-transform active:scale-90',
                  color === option.value && 'bg-app-surface-muted'
                )}
              >
                <span
                  className="h-6 w-6 rounded-full border border-app-border"
                  style={{ backgroundColor: option.swatch }}
                />
              </button>
            ))}
          </div>

          <SectionLabel className="mt-3">{tool === 'text' ? 'Размер' : 'Толщина'}</SectionLabel>
          {tool === 'text' ? (
            <select
              data-song-ink-text-size
              aria-label="Размер текста"
              value={nearestTextSize(width)}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="h-11 w-full rounded-app-sm border border-app-border bg-app-surface px-2 font-sans text-sm text-app-text"
            >
              {INK_TEXT_SIZES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <RangeSlider
                data-song-ink-width
                aria-label="Толщина линии"
                value={width}
                min={range.min}
                max={range.max}
                onChange={onWidthChange}
              />
              {/* Живой образец: подобрать толщину по числу невозможно. */}
              <div className="mt-1 flex h-6 items-center justify-center" aria-hidden>
                <span
                  className="w-4/5 rounded-full"
                  style={{ height: Math.max(2, width), backgroundColor: inkSwatchColor(color) }}
                />
              </div>
            </>
          )}
        </div>
      ) : (
        hintVisible && (
          <span
            data-song-ink-hint
            className="rounded-full border border-app-border bg-app-surface-elevated/95 px-3 py-1 font-sans text-xs text-app-text-muted shadow-app-sm"
          >
            {HINT_TEXT}
          </span>
        )
      )}

      <div
        data-song-ink-toolbar
        className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1.5 rounded-app-lg border border-app-border bg-app-surface-elevated/95 p-1.5 shadow-app-md backdrop-blur-md"
      >
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            data-song-ink-style-toggle
            aria-label="Цвет и толщина"
            title="Цвет и толщина"
            aria-pressed={styleOpen}
            disabled={!stylable}
            onClick={() => setPopup((prev) => (prev === 'style' ? null : 'style'))}
            className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-35 sm:w-10"
          >
            <span
              className={cn('h-7 w-7 rounded-full border-2', styleOpen ? 'border-app-primary' : 'border-app-border-strong')}
              style={{ backgroundColor: inkSwatchColor(color) }}
            />
          </button>

          <BarSeparator />

          {TOOL_ORDER.map((item) => {
            const Icon = TOOL_ICONS[item];
            const activeTool = tool === item;
            return (
              <BarButton
                key={item}
                label={INK_TOOL_LABELS[item]}
                pressed={activeTool}
                data-song-ink-tool={item}
                onClick={() => handleToolChange(item)}
                className={activeTool ? 'bg-app-primary text-app-text-inverse' : undefined}
              >
                <Icon size={19} />
              </BarButton>
            );
          })}

          <BarSeparator />

          <BarButton label="Отменить действие" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={19} />
          </BarButton>
          <BarButton
            label="Стереть все пометки"
            disabled={!hasStrokes}
            destructive
            onClick={() => setPopup('clear')}
          >
            <Trash2 size={19} />
          </BarButton>
        </div>

        {/* Выходы: на широком экране — продолжение строки за разделителем, на узком —
            отдельная строка НАД инструментами (order-first). */}
        <div className="order-first flex w-full items-center justify-between gap-1 sm:order-none sm:w-auto">
          <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-app-border-strong sm:block" />
          {zoom !== 1 && (
            <button
              type="button"
              data-song-ink-zoom-reset
              onClick={onResetZoom}
              className="h-9 shrink-0 rounded-full bg-app-surface-muted px-2.5 font-sans text-xs tabular-nums text-app-text-secondary active:scale-95"
            >
              ×{zoom.toFixed(1)} · сбросить
            </button>
          )}
          <button
            type="button"
            data-song-ink-cancel
            aria-label="Выйти без сохранения"
            onClick={handleCancel}
            className="h-9 shrink-0 rounded-full px-3 font-sans text-sm text-app-text-secondary hover:bg-app-surface-muted active:scale-95"
          >
            Отменить
          </button>
          <button
            type="button"
            data-song-ink-done
            onClick={onDone}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-app-success px-3 font-sans text-sm font-medium text-app-text-inverse active:scale-95"
          >
            <Check size={16} />
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-2 font-sans text-xs tracking-wide text-app-text-muted uppercase', className)}>
      {children}
    </div>
  );
}

function BarSeparator() {
  return <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-app-border-strong sm:block" />;
}

function BarButton({
  label,
  onClick,
  disabled,
  destructive,
  pressed,
  className,
  children,
  ...rest
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-10 w-9 shrink-0 items-center justify-center rounded-full transition-colors sm:w-10 active:scale-90 disabled:opacity-35',
        destructive ? 'text-app-primary hover:bg-app-missed' : 'text-app-text-secondary hover:bg-app-surface-muted',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
