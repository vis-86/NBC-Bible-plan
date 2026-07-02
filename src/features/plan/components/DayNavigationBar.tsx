'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  motion,
  useAnimate,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { ReadingPlanDay } from '@/types';
import { formatDateShort, getDayOfWeek } from '@/shared/utils/bible';
import { cn } from '@/shared/utils/cn';
import { useDayNavCarousel } from '../hooks/useDayNavCarousel';

const dlog: (...args: unknown[]) => void =
  process.env.NODE_ENV !== 'production'
    ? (...args) => console.debug('[day-nav]', ...args)
    : () => {};

const CUBE_WIDTH_PX = 56;
const GAP_PX = 12;
const STRIDE_PX = CUBE_WIDTH_PX + GAP_PX;

interface DayNavigationBarProps {
  plan: ReadingPlanDay[];
  selectedDayId: number | null;
  todayDayNumber: number;
  onSelectDay: (dayId: number) => void;
}

type DayStatus = 'completed' | 'missed' | 'future';

const getDayStatusForId = (
  day: ReadingPlanDay,
  todayDayNumber: number,
): DayStatus => {
  if (day.completed) return 'completed';
  if (day.id < todayDayNumber) return 'missed';
  return 'future';
};

const getStatusLabel = (status: DayStatus): string => {
  switch (status) {
    case 'completed':
      return 'выполнено';
    case 'missed':
      return 'пропущено';
    case 'future':
      return 'предстоит';
  }
};

const getDayCubeClasses = (status: DayStatus, isCenter: boolean): string => {
  const base =
    'day-navigation-cube flex-shrink-0 w-14 h-16 rounded-lg flex flex-col items-center justify-center relative active:scale-95 snap-center will-change-transform [transform-origin:center_bottom]';
  const statusStyles: Record<DayStatus, string> = {
    completed: 'bg-app-success text-app-text-inverse',
    missed: 'text-app-missed-text',
    future: 'text-app-text',
  };
  const ringColor: Record<DayStatus, string> = {
    completed: 'ring-app-success',
    missed: 'ring-app-missed-text',
    future: 'ring-app-text-muted',
  };
  const ring = isCenter ? `ring-2 ${ringColor[status]}` : '';
  return `${base} ${statusStyles[status]} ${ring}`;
};

interface CubeMotionProps {
  day: ReadingPlanDay;
  status: DayStatus;
  isSelected: boolean;
  isCenter: boolean;
  indexInTrack: number;
  leadingSpacerPx: number;
  trackWidthPx: number;
  scrollX: MotionValue<number>;
  reduceMotion: boolean;
  onClick: (dayId: number) => void;
}

const CubeMotionInner: React.FC<CubeMotionProps> = ({
  day,
  status,
  isSelected,
  isCenter,
  indexInTrack,
  leadingSpacerPx,
  trackWidthPx,
  scrollX,
  reduceMotion,
  onClick,
}) => {
  // [FIX] Compute scale directly from scrollX in a single useTransform.
  // Avoids chaining two motion-values which doubles re-subscription cost
  // and increases the chance of "stale frame" jumps when parent re-renders.
  const scale = useTransform(scrollX, (x) => {
    if (trackWidthPx === 0) return 1;
    const cubeCenter =
      leadingSpacerPx + indexInTrack * STRIDE_PX + CUBE_WIDTH_PX / 2;
    const dist = Math.abs(cubeCenter - (x + trackWidthPx / 2));
    if (dist <= STRIDE_PX) return 1.0 + ((0.92 - 1.0) * dist) / STRIDE_PX;
    if (dist <= 2 * STRIDE_PX)
      return 0.92 + ((0.85 - 0.92) * (dist - STRIDE_PX)) / STRIDE_PX;
    if (dist <= 3 * STRIDE_PX)
      return 0.85 + ((0.78 - 0.85) * (dist - 2 * STRIDE_PX)) / STRIDE_PX;
    return 0.78;
  });
  const opacity = useTransform(scrollX, (x) => {
    if (trackWidthPx === 0) return 1;
    const cubeCenter =
      leadingSpacerPx + indexInTrack * STRIDE_PX + CUBE_WIDTH_PX / 2;
    const dist = Math.abs(cubeCenter - (x + trackWidthPx / 2));
    if (dist <= STRIDE_PX) return 1.0 + ((0.85 - 1.0) * dist) / STRIDE_PX;
    if (dist <= 2 * STRIDE_PX)
      return 0.85 + ((0.55 - 0.85) * (dist - STRIDE_PX)) / STRIDE_PX;
    if (dist <= 3 * STRIDE_PX)
      return 0.55 + ((0.4 - 0.55) * (dist - 2 * STRIDE_PX)) / STRIDE_PX;
    return 0.4;
  });

  const handleClick = useCallback(() => onClick(day.id), [onClick, day.id]);

  const formattedDate = formatDateShort(day.dateStr);
  const dayOfWeek = getDayOfWeek(day.dateStr);
  const ariaLabel = `День ${day.id}, ${formattedDate}, ${getStatusLabel(status)}`;

  return (
    <motion.button
      id={`day-nav-cube-${day.id}`}
      data-day-nav-cube={day.id}
      data-day-nav-cube-status={status}
      data-day-nav-cube-selected={isSelected || undefined}
      role="option"
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={handleClick}
      className={getDayCubeClasses(status, isCenter)}
      style={reduceMotion ? undefined : { scale, opacity }}
    >
      {status === 'completed' && (
        <Check
          data-day-nav-cube-check
          size={14}
          className="day-navigation-cube-check absolute top-1 right-1 text-white"
          strokeWidth={3}
        />
      )}

      <span
        data-day-nav-cube-weekday
        className="text-[10px] uppercase font-medium opacity-80 mb-0.5"
      >
        {dayOfWeek}
      </span>

      <span
        data-day-nav-cube-pulse
        data-day-nav-cube-number
        className="day-navigation-cube-number text-base font-black leading-tight"
        style={{ display: 'inline-block', transformOrigin: 'center' }}
      >
        {day.id}
      </span>

      <span
        data-day-nav-cube-date
        className="day-navigation-cube-date text-[10px] font-medium opacity-80"
      >
        {formattedDate}
      </span>
    </motion.button>
  );
};

// [FIX] Memo with custom comparator — re-render only on meaningful prop changes.
// Without this, every parent re-render (e.g. URL useSearchParams update fires 4-5x
// on each snap) rebuilds all 365 cubes and tears down their useTransform motion-values,
// producing a visible jump at snap.
const CubeMotion = React.memo(CubeMotionInner, (prev, next) => {
  return (
    prev.day === next.day &&
    prev.status === next.status &&
    prev.isSelected === next.isSelected &&
    prev.isCenter === next.isCenter &&
    prev.indexInTrack === next.indexInTrack &&
    prev.leadingSpacerPx === next.leadingSpacerPx &&
    prev.trackWidthPx === next.trackWidthPx &&
    prev.scrollX === next.scrollX &&
    prev.reduceMotion === next.reduceMotion &&
    prev.onClick === next.onClick
  );
});

export const DayNavigationBar: React.FC<DayNavigationBarProps> = ({
  plan,
  selectedDayId,
  todayDayNumber,
  onSelectDay,
}) => {
  const filteredPlan = useMemo(() => plan.filter((d) => d.id > 0), [plan]);
  const dayIds = useMemo(() => filteredPlan.map((d) => d.id), [filteredPlan]);
  const dayMap = useMemo(() => {
    const map = new Map<number, ReadingPlanDay>();
    for (const d of filteredPlan) map.set(d.id, d);
    return map;
  }, [filteredPlan]);

  const reduceMotion = useReducedMotion() ?? false;

  const [scope, animate] = useAnimate<HTMLDivElement>();

  const {
    leadingSpacerPx,
    trailingSpacerPx,
    trackWidthPx,
    centerDayId,
    snappedDayId,
    scrollX,
    scrollToDay,
  } = useDayNavCarousel({
    trackRef: scope,
    dayIds,
    selectedDayId,
    onSnapToDay: onSelectDay,
    cubeWidthPx: CUBE_WIDTH_PX,
    gapPx: GAP_PX,
  });

  const prevPulsedDayRef = useRef<number | null>(null);
  useEffect(() => {
    if (snappedDayId === null) return;
    if (snappedDayId === prevPulsedDayRef.current) return;
    prevPulsedDayRef.current = snappedDayId;
    if (reduceMotion) return;
    const root = scope.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(
      `[data-day-nav-cube="${snappedDayId}"] [data-day-nav-cube-pulse]`,
    );
    if (!el) {
      dlog('snap pulse skipped (cube not in DOM)', snappedDayId);
      return;
    }
    try {
      // [FIX] Pulse amplitude lowered (1.08 vs 1.18) and overshoot ease replaced
      // with smooth ease-out — the previous overshoot was perceived as a "jump"
      // when combined with cube-rebuilds on parent re-render.
      animate(
        el,
        { scale: [1.08, 1.0] },
        { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      ).then(() => undefined).catch(() => undefined);
      dlog('snap pulse for', snappedDayId);
    } catch (err) {
      dlog('snap pulse error', err);
    }
  }, [snappedDayId, reduceMotion, animate, scope]);

  useEffect(() => {
    dlog('reduce-motion =', reduceMotion);
  }, [reduceMotion]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (dayIds.length === 0) return;
      const currentId = centerDayId ?? selectedDayId ?? dayIds[0];
      const currentIdx = dayIds.indexOf(currentId);
      if (currentIdx < 0) return;
      let targetIdx: number | null = null;
      switch (event.key) {
        case 'ArrowLeft':
          targetIdx = Math.max(0, currentIdx - 1);
          break;
        case 'ArrowRight':
          targetIdx = Math.min(dayIds.length - 1, currentIdx + 1);
          break;
        case 'Home':
          targetIdx = 0;
          break;
        case 'End':
          targetIdx = dayIds.length - 1;
          break;
        default:
          return;
      }
      if (targetIdx === null || targetIdx === currentIdx) return;
      event.preventDefault();
      const targetDayId = dayIds[targetIdx];
      dlog('keyboard nav', { key: event.key, from: currentId, to: targetDayId });
      scrollToDay(targetDayId, 'smooth');
    },
    [dayIds, centerDayId, selectedDayId, scrollToDay],
  );

  // [FIX] Stable ref for click handler — without this, handleCubeClick reference
  // changes on every centerDayId tick (which fires on each scroll frame), busting
  // CubeMotion's React.memo and causing all 365 cubes to rerender on every scroll.
  const centerDayIdRef = useRef<number | null>(centerDayId);
  const selectedDayIdRef = useRef<number | null>(selectedDayId);
  const onSelectDayRef = useRef(onSelectDay);
  const scrollToDayRef = useRef(scrollToDay);
  useLayoutEffect(() => {
    centerDayIdRef.current = centerDayId;
    selectedDayIdRef.current = selectedDayId;
    onSelectDayRef.current = onSelectDay;
    scrollToDayRef.current = scrollToDay;
  });

  const handleCubeClick = useCallback((dayId: number) => {
    if (dayId === centerDayIdRef.current) {
      if (selectedDayIdRef.current !== dayId) {
        onSelectDayRef.current(dayId);
      }
      return;
    }
    dlog('cube click → smooth scroll to', dayId);
    scrollToDayRef.current(dayId, 'smooth');
  }, []);

  const showTodayButton =
    centerDayId !== null && centerDayId !== todayDayNumber;
  const todayIsRight =
    centerDayId !== null && centerDayId < todayDayNumber;

  const handleTodayClick = useCallback(() => {
    dlog('today button click');
    scrollToDay(todayDayNumber, 'smooth');
  }, [scrollToDay, todayDayNumber]);

  return (
    <div data-day-nav-bar className="relative flex flex-col gap-2">
      <div
        ref={scope}
        data-day-nav-bar-track
        role="listbox"
        aria-label="Дни плана чтения"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-activedescendant={
          selectedDayId !== null ? `day-nav-cube-${selectedDayId}` : undefined
        }
        className={cn(
          'day-navigation-bar w-full overflow-x-auto pt-8 pb-8',
          'snap-x snap-mandatory',
          '[scroll-snap-stop:normal]',
          '[touch-action:pan-x]',
          '[overscroll-behavior-x:contain]',
          '[overflow-anchor:none]',
          'outline-none focus-visible:[box-shadow:inset_0_0_0_2px_var(--app-primary-muted)]',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        <div
          data-day-nav-bar-scroll
          className="flex items-center"
          style={{ minWidth: 'max-content' }}
        >
          <div
            aria-hidden
            className="shrink-0"
            style={{ width: `${leadingSpacerPx}px` }}
          />
          <div className="flex gap-3">
            {dayIds.map((id, i) => {
              const day = dayMap.get(id);
              if (!day) return null;
              const status = getDayStatusForId(day, todayDayNumber);
              const isSelected = id === selectedDayId;
              const isCenter = id === centerDayId;
              return (
                <CubeMotion
                  key={id}
                  day={day}
                  status={status}
                  isSelected={isSelected}
                  isCenter={isCenter}
                  indexInTrack={i}
                  leadingSpacerPx={leadingSpacerPx}
                  trackWidthPx={trackWidthPx}
                  scrollX={scrollX}
                  reduceMotion={reduceMotion}
                  onClick={handleCubeClick}
                />
              );
            })}
          </div>
          <div
            aria-hidden
            className="shrink-0"
            style={{ width: `${trailingSpacerPx}px` }}
          />
        </div>
      </div>

      {/* [FIX] Mask container is always mounted and always the same geometry.
          Visibility is toggled via opacity + pointer-events so the carousel
          edges never "jump" when the Today pill appears/disappears or when
          `todayIsRight` flips sides while scrolling past today. */}
      <div
        aria-hidden={!showTodayButton}
        className={cn(
          'absolute inset-y-2 flex items-top z-10 w-28',
          reduceMotion ? undefined : 'transition-opacity duration-200',
          showTodayButton
            ? 'opacity-100 pointer-events-none'
            : 'opacity-0 pointer-events-none',
          todayIsRight
            ? 'left-0 bg-gradient-to-r from-app-bg via-app-bg/80 to-transparent pl-2 justify-start'
            : 'right-0 bg-gradient-to-l from-app-bg via-app-bg/80 to-transparent pr-2 justify-end',
        )}
      >
        <button
          data-day-nav-bar-today-btn
          onClick={handleTodayClick}
          tabIndex={showTodayButton ? 0 : -1}
          aria-label="Перейти на сегодня"
          className={cn(
            'group flex items-center gap-1 h-5 rounded-md',
            showTodayButton ? 'pointer-events-auto' : 'pointer-events-none',
            'bg-app-primary text-app-text-inverse',
            'text-xs font-bold tracking-wide',
            'shadow-app-sm transition-all duration-200',
            'hover:scale-105 hover:shadow-app-md active:scale-95',
            todayIsRight ? 'ml-1 pl-1 pr-1.5' : 'mr-1 pl-1.5 pr-1',
          )}
        >
          {todayIsRight ? (
            <>
              <span>Сегодня</span>
              <ChevronRight
                size={13}
                strokeWidth={3}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </>
          ) : (
            <>
              <ChevronLeft
                size={13}
                strokeWidth={3}
                className="transition-transform duration-200 group-hover:-translate-x-0.5"
              />
              <span>Сегодня</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
