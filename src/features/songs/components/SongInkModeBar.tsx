'use client';

/**
 * Плашка режима пометок (M10, §6) — верх экрана по центру.
 *
 * Зачем отдельная поверхность: пока рисуешь, лист занимает весь экран, и «я сейчас
 * рисую пером красным» неоткуда прочитать — рельс инструментов у большого пальца
 * показывает выбор иконкой, а не словом. Плашка держит состояние (цвет + название
 * инструмента + масштаб) и оба выхода из режима.
 *
 * Выходы («Готово»/«Отменить») живут здесь, а не в рельсе, по двум причинам: они не
 * инструменты (нечего группировать с пером), и разрушающее «выйти без сохранения» не
 * должно стоять под большим пальцем рядом с ластиком.
 */
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { INK_TOOL_LABELS, inkSwatchColor, type InkToolChoice } from '../lib/inkTools';
import { SongInkConfirm } from './SongInkConfirm';

export interface SongInkModeBarProps {
  tool: InkToolChoice;
  color: string;
  /** Есть несохранённые правки — выход подтверждаем. */
  dirty: boolean;
  /** Текущий масштаб листа; 1 — чип масштаба не показываем. */
  zoom: number;
  onResetZoom: () => void;
  onDone: () => void;
  onCancel: () => void;
}

/** Подсказка о двухпальцевом жесте: сам его никто не найдёт. */
const HINT_TEXT = 'Два пальца — прокрутка и масштаб';
const HINT_MS = 3500;

export function SongInkModeBar({
  tool,
  color,
  dirty,
  zoom,
  onResetZoom,
  onDone,
  onCancel,
}: SongInkModeBarProps) {
  const [hintVisible, setHintVisible] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), HINT_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleCancel = () => {
    // Подтверждаем только когда есть что терять.
    if (dirty) setConfirming(true);
    else onCancel();
  };

  return (
    <div
      data-song-ink-ui
      data-song-ink-modebar
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex flex-col items-center gap-1.5 px-3"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-app-border bg-app-surface-elevated/95 py-1 pr-1 pl-3 shadow-app-md backdrop-blur-md">
        <span
          aria-hidden
          data-song-ink-modebar-color
          className="h-3 w-3 shrink-0 rounded-full border border-app-border"
          style={{ backgroundColor: inkSwatchColor(color) }}
        />
        <span data-song-ink-modebar-tool className="truncate font-sans text-sm font-medium text-app-text">
          {INK_TOOL_LABELS[tool]}
        </span>

        {zoom !== 1 && (
          <button
            type="button"
            data-song-ink-zoom-reset
            onClick={onResetZoom}
            className="shrink-0 rounded-full bg-app-surface-muted px-2 py-1 font-sans text-xs tabular-nums text-app-text-secondary active:scale-95"
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

      {confirming && (
        <SongInkConfirm
          text="Выйти без сохранения?"
          confirmLabel="Выйти"
          onConfirm={() => {
            setConfirming(false);
            onCancel();
          }}
          onDismiss={() => setConfirming(false)}
        />
      )}

      {hintVisible && !confirming && (
        <span
          data-song-ink-hint
          className="rounded-full border border-app-border bg-app-surface-elevated/95 px-3 py-1 font-sans text-xs text-app-text-muted shadow-app-sm"
        >
          {HINT_TEXT}
        </span>
      )}
    </div>
  );
}
