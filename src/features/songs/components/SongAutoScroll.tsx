'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Pause, Play } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { AUTOSCROLL_STEPS } from '../lib/autoScroll';

/**
 * Управление автоскроллом (§8, §4.5). UX по референсу `nbc-music-chordpro`
 * (`AutoScrollSpeedButtons`), проверенному на практике:
 *
 * - play/pause — компактный FAB внизу справа; его позицию задаёт `SongToolStack`,
 *   собственного позиционирования у кнопки нет;
 * - во время проигрывания справа по центру высоты экрана появляются ДВЕ большие
 *   кнопки скорости (вверх = медленнее, вниз = быстрее). Они полупрозрачные, чтобы
 *   не перекрывать текст, и на ~0.5с становятся заметнее при нажатии. Это оверлей
 *   уровня вьюпорта, поэтому он уходит порталом в `body` — внутри стека `fixed`
 *   считался бы от бокса стека (у стека есть `translate` ⇒ containing block).
 *
 * Всё рендерится ВНЕ скролл-контейнера (см. `page.tsx`): слушатель паузы висит на
 * контейнере, а тап по этим кнопкам до него не всплывает, поэтому регулировка
 * скорости не ставит автоскролл на паузу (`stopPropagation` не нужен).
 *
 * На короткой песне (`!canScroll`) контрол отсутствует в DOM: скроллить нечего.
 */
export interface SongAutoScrollProps {
  playing: boolean;
  /** Индекс текущей ступени `[0..4]`. */
  step: number;
  /** Есть ли что скроллить — при `false` контрол не рендерится. */
  canScroll: boolean;
  onToggle: () => void;
  onSetStep: (step: number) => void;
}

const MAX_STEP_INDEX = AUTOSCROLL_STEPS.length - 1;
const TAP_TARGET = 'transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary';
/** Насколько блок скорости заметнее становится после нажатия (мс). */
const ACTIVE_FLASH_MS = 500;

export function SongAutoScroll({ playing, step, canScroll, onToggle, onSetStep }: SongAutoScrollProps) {
  // Полупрозрачные кнопки скорости на короткое время «проявляются» после нажатия.
  const [speedActive, setSpeedActive] = useState(false);
  const flashTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // Скроллить нечего — контрол не нужен вовсе.
  if (!canScroll) return null;

  const flashSpeed = () => {
    setSpeedActive(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSpeedActive(false), ACTIVE_FLASH_MS);
  };

  const changeStep = (delta: number) => {
    const next = Math.max(0, Math.min(MAX_STEP_INDEX, step + delta));
    flashSpeed();
    if (next !== step) onSetStep(next);
  };

  const speedButtonClass = cn(
    'flex h-20 w-20 items-center justify-center rounded-app-md bg-app-surface-elevated text-app-text-secondary shadow-app-card',
    'hover:text-app-text disabled:opacity-30 disabled:pointer-events-none',
    TAP_TARGET,
  );

  // Кнопки скорости — оверлей уровня вьюпорта (правый край, по центру высоты), а не
  // часть углового стека. `fixed` тут обязан считаться от вьюпорта, поэтому панель
  // уходит порталом в body: SongToolStack анимирует скрытие CSS-свойством `translate`,
  // а translate/transform у предка создаёт containing block — вложенный `fixed`
  // считался бы от 48-пиксельного бокса стека и уезжал за правый край экрана.
  const speedPanel = playing ? (
    <div
      data-song-autoscroll-speed
      className={cn(
        'pointer-events-auto fixed right-3 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2 transition-opacity duration-300',
        speedActive ? 'opacity-100' : 'opacity-40',
      )}
    >
      <button
        type="button"
        data-song-autoscroll-slower
        aria-label="Медленнее"
        disabled={step <= 0}
        onClick={() => changeStep(-1)}
        className={speedButtonClass}
      >
        <ChevronUp size={36} />
      </button>
      <span data-song-autoscroll-speed-value className="text-sm font-semibold tabular-nums text-app-text-secondary">
        {step + 1}
      </span>
      <button
        type="button"
        data-song-autoscroll-faster
        aria-label="Быстрее"
        disabled={step >= MAX_STEP_INDEX}
        onClick={() => changeStep(1)}
        className={speedButtonClass}
      >
        <ChevronDown size={36} />
      </button>
    </div>
  ) : null;

  return (
    // Собственного оверлея у контрола нет: play/pause — обычный элемент потока,
    // его место на экране задаёт SongToolStack (правый нижний угол). Полноэкранный
    // `fixed inset-0` внутри стека раскладывался по боксу стека, а не по вьюпорту,
    // и выталкивал FAB за правый край.
    // display:contents — FAB остаётся flex-элементом SongToolStack (обёртка не создаёт
    // собственного бокса и не ломает раскладку стека).
    <div data-song-autoscroll className="contents">
      {/* Гидратации портал не мешает: при первом рендере автоскролл всегда на паузе
          (playing=false ⇒ панели нет), так что пререндеренная разметка совпадает. */}
      {speedPanel !== null && typeof document !== 'undefined' ? createPortal(speedPanel, document.body) : null}

      {/* Play/pause — компактный круглый FAB: матовый (backdrop-blur), иконка — primary. */}
      <button
        type="button"
        data-song-autoscroll-toggle
        aria-label={playing ? 'Пауза автоскролла' : 'Запустить автоскролл'}
        aria-pressed={playing}
        onClick={onToggle}
        className={cn(
          'pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-app-surface-elevated/70 text-app-primary shadow-app-card backdrop-blur-md',
          TAP_TARGET,
        )}
      >
        {playing ? <Pause size={22} /> : <Play size={22} />}
      </button>
    </div>
  );
}

export default SongAutoScroll;
