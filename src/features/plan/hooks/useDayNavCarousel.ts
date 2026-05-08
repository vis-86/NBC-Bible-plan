'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { motionValue, type MotionValue } from 'motion/react';

const dlog: (...args: unknown[]) => void =
  process.env.NODE_ENV !== 'production'
    ? (...args) => console.debug('[day-nav]', ...args)
    : () => {};

const SCROLLEND_FALLBACK_MS = 120;
const HYSTERESIS_PX = 4;

export interface UseDayNavCarouselArgs {
  trackRef: RefObject<HTMLDivElement | null>;
  dayIds: number[];
  selectedDayId: number | null;
  onSnapToDay: (dayId: number) => void;
  cubeWidthPx: number;
  gapPx: number;
}

export interface UseDayNavCarouselReturn {
  leadingSpacerPx: number;
  trailingSpacerPx: number;
  trackWidthPx: number;
  centerDayId: number | null;
  snappedDayId: number | null;
  isScrolling: boolean;
  scrollX: MotionValue<number>;
  scrollToDay: (dayId: number, behavior?: ScrollBehavior) => void;
}

export function useDayNavCarousel({
  trackRef,
  dayIds,
  selectedDayId,
  onSnapToDay,
  cubeWidthPx,
  gapPx,
}: UseDayNavCarouselArgs): UseDayNavCarouselReturn {
  const scrollX = useMemo<MotionValue<number>>(() => motionValue(0), []);

  const [trackWidth, setTrackWidth] = useState<number>(0);
  const [centerDayId, setCenterDayId] = useState<number | null>(selectedDayId);
  const [snappedDayId, setSnappedDayId] = useState<number | null>(null);
  const [isScrolling, setIsScrolling] = useState<boolean>(false);

  const centerDayIdRef = useRef<number | null>(centerDayId);
  const selectedDayIdRef = useRef<number | null>(selectedDayId);
  const dayIdsRef = useRef<number[]>(dayIds);
  const trackWidthRef = useRef<number>(trackWidth);
  const onSnapToDayRef = useRef(onSnapToDay);

  useLayoutEffect(() => {
    centerDayIdRef.current = centerDayId;
    selectedDayIdRef.current = selectedDayId;
    dayIdsRef.current = dayIds;
    trackWidthRef.current = trackWidth;
    onSnapToDayRef.current = onSnapToDay;
  });

  const isScrollingRef = useRef<boolean>(false);
  const hasCenteredRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stride = cubeWidthPx + gapPx;
  const halfViewportPadding = Math.max(0, (trackWidth - cubeWidthPx) / 2);

  const leadingSpacerPx = halfViewportPadding;
  const trailingSpacerPx = halfViewportPadding;

  const computeCenterDayIdFromScroll = useCallback(
    (scrollLeft: number): number | null => {
      const ids = dayIdsRef.current;
      if (ids.length === 0) return null;
      const trackW = trackWidthRef.current;
      if (trackW === 0) return ids[0] ?? null;
      const viewportCenter = scrollLeft + trackW / 2;
      const halfPad = Math.max(0, (trackW - cubeWidthPx) / 2);
      const rawIndex = (viewportCenter - halfPad - cubeWidthPx / 2) / stride;
      const nearest = Math.round(rawIndex);
      const clamped = Math.max(0, Math.min(ids.length - 1, nearest));
      const nearestCenter = halfPad + clamped * stride + cubeWidthPx / 2;
      const distance = Math.abs(viewportCenter - nearestCenter);
      const halfStrideMinusDead = stride / 2 - HYSTERESIS_PX;
      if (distance > halfStrideMinusDead && centerDayIdRef.current !== null) {
        return centerDayIdRef.current;
      }
      return ids[clamped] ?? null;
    },
    [stride, cubeWidthPx],
  );

  const scrollToDay = useCallback(
    (dayId: number, behavior: ScrollBehavior = 'auto') => {
      const ids = dayIds;
      const targetIndex = ids.indexOf(dayId);
      if (targetIndex < 0) {
        dlog('scrollToDay: day not found', dayId);
        return;
      }
      const track = trackRef.current;
      if (!track) {
        dlog('scrollToDay: track ref not ready, deferring', dayId);
        return;
      }
      if (centerDayIdRef.current === dayId && behavior === 'smooth') {
        dlog('scrollToDay: already centered, no-op', dayId);
        return;
      }
      const tw = track.clientWidth || trackWidthRef.current;
      const halfPad = Math.max(0, (tw - cubeWidthPx) / 2);
      const cubeCenterInTrack = halfPad + targetIndex * stride + cubeWidthPx / 2;
      const targetScroll = Math.max(0, cubeCenterInTrack - tw / 2);
      // scroll-snap-type: x mandatory blocks programmatic scrollTo in Chrome.
      // Temporarily disable snap, perform the scroll, then restore on scrollend.
      const prevSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';
      const restore = () => {
        track.style.scrollSnapType = prevSnap;
        track.removeEventListener('scrollend', restore);
        if (restoreTimerRef.current) {
          clearTimeout(restoreTimerRef.current);
          restoreTimerRef.current = null;
        }
      };
      if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
      track.addEventListener('scrollend', restore, { once: true });
      restoreTimerRef.current = setTimeout(restore, 1500);
      track.scrollTo({ left: targetScroll, behavior });
    },
    [trackRef, dayIds, stride, cubeWidthPx],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const initialWidth = track.clientWidth;
    setTrackWidth(initialWidth);
    trackWidthRef.current = initialWidth;
    dlog('mount', {
      totalDays: dayIdsRef.current.length,
      selectedDayId: selectedDayIdRef.current,
      trackWidth: initialWidth,
    });
  }, [trackRef]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth === trackWidthRef.current) continue;
        trackWidthRef.current = newWidth;
        setTrackWidth(newWidth);
        const center = centerDayIdRef.current;
        if (center !== null) {
          dlog('resize, repositioning', { newWidth, centerDayId: center });
          requestAnimationFrame(() => {
            const ids = dayIdsRef.current;
            const idx = ids.indexOf(center);
            if (idx < 0) return;
            const halfPad = Math.max(0, (newWidth - cubeWidthPx) / 2);
            const cubeCenterInTrack = halfPad + idx * stride + cubeWidthPx / 2;
            track.scrollLeft = Math.max(0, cubeCenterInTrack - newWidth / 2);
          });
        }
      }
    });
    ro.observe(track);
    return () => {
      ro.disconnect();
    };
  }, [trackRef, stride, cubeWidthPx]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const supportsScrollEnd =
      typeof window !== 'undefined' && 'onscrollend' in window;

    const flushSnap = (source: 'scrollend' | 'fallback') => {
      isScrollingRef.current = false;
      setIsScrolling(false);
      const next = centerDayIdRef.current;
      if (next === null) return;
      setSnappedDayId(next);
      if (next !== selectedDayIdRef.current) {
        dlog(`${source} → snap to`, next);
        onSnapToDayRef.current(next);
      } else {
        dlog(`${source} → no change`, next);
      }
    };

    const onScroll = () => {
      const left = track.scrollLeft;
      scrollX.set(left);
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        setIsScrolling(true);
      }
      const next = computeCenterDayIdFromScroll(left);
      if (next !== centerDayIdRef.current) {
        centerDayIdRef.current = next;
        setCenterDayId(next);
        dlog('center →', next);
      }
      if (!supportsScrollEnd) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          dlog('scrollend fallback used');
          flushSnap('fallback');
        }, SCROLLEND_FALLBACK_MS);
      } else {
        if (isScrollingTimerRef.current) clearTimeout(isScrollingTimerRef.current);
        isScrollingTimerRef.current = setTimeout(() => {
          if (isScrollingRef.current) {
            dlog('isScrolling watchdog reset');
            isScrollingRef.current = false;
            setIsScrolling(false);
          }
        }, 1000);
      }
    };

    const onScrollEnd = () => {
      flushSnap('scrollend');
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    if (supportsScrollEnd) {
      track.addEventListener('scrollend', onScrollEnd);
    }

    return () => {
      track.removeEventListener('scroll', onScroll);
      if (supportsScrollEnd) {
        track.removeEventListener('scrollend', onScrollEnd);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (isScrollingTimerRef.current) {
        clearTimeout(isScrollingTimerRef.current);
        isScrollingTimerRef.current = null;
      }
    };
  }, [trackRef, computeCenterDayIdFromScroll, scrollX]);

  // Initial mount centering ONLY. External selectedDayId changes after mount are
  // intentionally NOT auto-centered to avoid ping-pong with outside state managers.
  useEffect(() => {
    if (hasCenteredRef.current) return;
    if (selectedDayId === null) return;
    if (trackWidth === 0) return;
    const ids = dayIds;
    const idx = ids.indexOf(selectedDayId);
    if (idx < 0) return;
    const handle = requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const tw = track.clientWidth || trackWidthRef.current;
      const halfPad = Math.max(0, (tw - cubeWidthPx) / 2);
      const target = halfPad + idx * stride + cubeWidthPx / 2 - tw / 2;
      track.scrollLeft = Math.max(0, target);
      centerDayIdRef.current = selectedDayId;
      setCenterDayId(selectedDayId);
      setSnappedDayId(selectedDayId);
      hasCenteredRef.current = true;
      dlog('initial center → jump to', selectedDayId);
    });
    return () => cancelAnimationFrame(handle);
  }, [trackRef, selectedDayId, trackWidth, dayIds, stride, cubeWidthPx]);

  return {
    leadingSpacerPx,
    trailingSpacerPx,
    trackWidthPx: trackWidth,
    centerDayId,
    snappedDayId,
    isScrolling,
    scrollX,
    scrollToDay,
  };
}
