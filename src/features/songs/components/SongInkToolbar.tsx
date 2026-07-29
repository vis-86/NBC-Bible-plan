'use client';

/**
 * Рельс инструментов режима рукописных пометок (M10, §7).
 *
 * Вертикальный рельс у правого нижнего края, а не нижний док во всю ширину: док съедал
 * четыре строки песни ровно там, где на репетиции читают, и всё равно требовал двух
 * рядов под цвет и толщину. Рельс занимает фиксированные ~52px по горизонтали, растёт
 * вверх из той же точки, где вне режима живёт карандаш (`SongToolStack`), — контракт
 * «активный инструмент забирает правый край целиком» соблюдён буквально.
 *
 * Порядок групп снизу вверх — по частоте, а не по алфавиту: стиль (цвет + толщина) и
 * инструменты у большого пальца, история выше. Выходы из режима («Готово»/«Отменить»)
 * живут в `SongInkModeBar`: разрушающему действию не место под пальцем рядом с ластиком.
 *
 * Цвет и толщина — во всплывающей карточке СЛЕВА от рельса (сиблинг в `flex`, а не
 * absolute-смещение): позиция карточки не разъезжается при смене ширины рельса.
 */
import { useState } from 'react';
import { ArrowUpRight, Eraser, Highlighter, Pen, Trash2, Type, Undo2 } from 'lucide-react';
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
  onToolChange: (tool: InkToolChoice) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
}

const TOOL_ICONS: Record<InkToolChoice, typeof Pen> = {
  pen: Pen,
  highlighter: Highlighter,
  arrow: ArrowUpRight,
  text: Type,
  eraser: Eraser,
};

/** Снизу вверх внутри своей группы (рельс — `flex-col-reverse`). */
const TOOL_ORDER: InkToolChoice[] = ['pen', 'highlighter', 'arrow', 'text', 'eraser'];

export function SongInkToolbar({
  tool,
  color,
  width,
  canUndo,
  hasStrokes,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onClearAll,
}: SongInkToolbarProps) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  // У ластика нет ни цвета, ни толщины — карточку стиля показывать нечему.
  const stylable = tool !== 'eraser';
  const widthTarget: SongInkTool = tool === 'eraser' ? 'pen' : tool;
  const range = INK_WIDTH_RANGE[widthTarget];

  const handleToolChange = (next: InkToolChoice) => {
    if (next === 'eraser') setStyleOpen(false);
    onToolChange(next);
  };

  return (
    <div
      data-song-ink-ui
      className="pointer-events-none absolute right-3.5 bottom-3.5 z-30 flex items-end gap-2 pb-safe"
    >
      {confirmingClear ? (
        <SongInkConfirm
          text="Стереть все пометки?"
          confirmLabel="Стереть"
          onConfirm={() => {
            setConfirmingClear(false);
            onClearAll();
          }}
          onDismiss={() => setConfirmingClear(false)}
        />
      ) : (
        styleOpen &&
        stylable && (
          <div
            data-song-ink-style
            className="pointer-events-auto w-56 rounded-app-lg border border-app-border bg-app-surface-elevated p-3 shadow-app-md"
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
        )
      )}

      <div
        data-song-ink-toolbar
        className="pointer-events-auto flex flex-col-reverse items-center gap-1 rounded-app-lg border border-app-border bg-app-surface-elevated/95 p-1.5 shadow-app-md backdrop-blur-md"
      >
        <button
          type="button"
          data-song-ink-style-toggle
          aria-label="Цвет и толщина"
          title="Цвет и толщина"
          aria-pressed={styleOpen}
          disabled={!stylable}
          onClick={() => setStyleOpen((prev) => !prev)}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-35"
        >
          <span
            className={cn(
              'h-7 w-7 rounded-full border-2',
              styleOpen ? 'border-app-primary' : 'border-app-border-strong'
            )}
            style={{ backgroundColor: inkSwatchColor(color) }}
          />
        </button>

        <RailSeparator />

        {TOOL_ORDER.map((item) => {
          const Icon = TOOL_ICONS[item];
          const activeTool = tool === item;
          return (
            <RailButton
              key={item}
              label={INK_TOOL_LABELS[item]}
              pressed={activeTool}
              data-song-ink-tool={item}
              onClick={() => handleToolChange(item)}
              className={activeTool ? 'bg-app-primary text-app-text-inverse' : undefined}
            >
              <Icon size={19} />
            </RailButton>
          );
        })}

        <RailSeparator />

        <RailButton label="Отменить действие" disabled={!canUndo} onClick={onUndo}>
          <Undo2 size={19} />
        </RailButton>
        <RailButton
          label="Стереть все пометки"
          disabled={!hasStrokes}
          destructive
          onClick={() => {
            setStyleOpen(false);
            setConfirmingClear(true);
          }}
        >
          <Trash2 size={19} />
        </RailButton>
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

function RailSeparator() {
  return <span aria-hidden className="my-0.5 h-px w-6 bg-app-border-strong" />;
}

function RailButton({
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
        'flex h-10 w-10 items-center justify-center rounded-full transition-colors active:scale-90 disabled:opacity-35',
        destructive ? 'text-app-primary hover:bg-app-missed' : 'text-app-text-secondary hover:bg-app-surface-muted',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
