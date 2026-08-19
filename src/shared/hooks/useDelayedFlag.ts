'use client';

import { useEffect, useState } from 'react';

/**
 * Показ индикатора загрузки с задержкой: `true` возвращается, только если исходный
 * флаг продержался дольше `delayMs`.
 *
 * Зачем: все офлайн-ресурсы читаются cache-first, и на закешированной песне/главе
 * загрузка длится десятки миллисекунд. Спиннер за это время успевает мигнуть и
 * пропасть — экран «прыгает» на ровном месте. Отдав индикатор с задержкой, быстрый
 * путь остаётся визуально мгновенным, а медленный по-прежнему показывает прогресс.
 */
export function useDelayedFlag(flag: boolean, delayMs = 180): boolean {
  const [state, setState] = useState({ flag, visible: false });

  // Сброс при смене флага — правкой состояния во время рендера (штатный приём React
  // «derive state from props»), а не эффектом: эффект дал бы лишний кадр с уже
  // ненужным индикатором на экране.
  if (state.flag !== flag) setState({ flag, visible: false });

  useEffect(() => {
    if (!flag) return;
    const timer = setTimeout(() => setState({ flag: true, visible: true }), delayMs);
    return () => clearTimeout(timer);
  }, [flag, delayMs]);

  return state.flag === flag && state.visible;
}
