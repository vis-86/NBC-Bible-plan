'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Шаг обновления отсчёта: чаще секунды, чтобы цифра на кнопке не отставала от таймера. */
const TICK_MS = 250;

export interface UseAutoScrollAutostartParams {
  /** Скролл-контейнер листа: касание/колесо по нему отменяет отсчёт. */
  containerRef: RefObject<HTMLElement | null>;
  songId: string;
  /**
   * Можно ли сейчас вести отсчёт (настройка включена, песня сета, есть что скроллить,
   * нет шторок и режима пометок). Снятие — пауза с повтором с полной задержки, а не отмена:
   * шторку открыли поправить тональность, а не отказаться от автозапуска.
   */
  enabled: boolean;
  /** Автоскролл уже едет — отсчёт не нужен и больше не вернётся на этой песне. */
  playing: boolean;
  delaySeconds: number;
  onStart: () => void;
}

/**
 * Отсчёт автозапуска автоскролла в сете. Срабатывает один раз на песню: после старта
 * (своего или ручного) и после отмены касанием листа отсчёт на этой песне не
 * возвращается — иначе пауза автоскролла через N секунд снова запускала бы его сама.
 * Новая песня сета — новый отсчёт.
 *
 * Касание листа отменяет отсчёт: человек взял лист в руки, и поехавший под пальцем
 * текст был бы сюрпризом. Запустить сразу — тапом по FAB (это делает вызывающий).
 *
 * Возвращает оставшиеся секунды либо `null`, если отсчёта нет.
 */
export function useAutoScrollAutostart({
  containerRef,
  songId,
  enabled,
  playing,
  delaySeconds,
  onStart,
}: UseAutoScrollAutostartParams): number | null {
  const [consumedFor, setConsumedFor] = useState<string | null>(null);
  const consumed = consumedFor === songId;
  const active = enabled && !playing && !consumed && songId !== '';

  // Старт любым путём (FAB, наш таймер) гасит автозапуск на эту песню. Правим в рендере
  // по текущему значению (рекомендация React), а не эффектом с setState.
  if (playing && !consumed && songId !== '') setConsumedFor(songId);

  // Каждый новый взвод отсчёта (песня сменилась, шторку закрыли) начинает с полной задержки.
  const armKey = active ? `${songId}:${delaySeconds}` : null;
  const [tracked, setTracked] = useState<{ armKey: string | null; remaining: number }>({ armKey, remaining: delaySeconds });
  if (tracked.armKey !== armKey) setTracked({ armKey, remaining: delaySeconds });

  const onStartRef = useRef(onStart);
  useEffect(() => {
    onStartRef.current = onStart;
  });

  useEffect(() => {
    if (!active) return;
    const startedAt = performance.now();
    const delayMs = delaySeconds * 1000;
    const timer = setInterval(() => {
      const left = delayMs - (performance.now() - startedAt);
      if (left <= 0) {
        clearInterval(timer);
        console.debug('[useAutoScrollAutostart] fire', { songId, delaySeconds });
        setConsumedFor(songId);
        onStartRef.current();
        return;
      }
      const remaining = Math.ceil(left / 1000);
      setTracked((prev) => (prev.remaining === remaining ? prev : { ...prev, remaining }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, delaySeconds, songId]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const cancel = () => {
      console.debug('[useAutoScrollAutostart] cancelled by manual scroll', { songId });
      setConsumedFor(songId);
    };
    container.addEventListener('touchstart', cancel, { passive: true });
    container.addEventListener('wheel', cancel, { passive: true });
    return () => {
      container.removeEventListener('touchstart', cancel);
      container.removeEventListener('wheel', cancel);
    };
  }, [active, containerRef, songId]);

  return active ? tracked.remaining : null;
}
