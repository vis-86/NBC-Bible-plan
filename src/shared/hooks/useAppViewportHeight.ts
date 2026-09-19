'use client';

import { useEffect } from 'react';

export const APP_VIEWPORT_HEIGHT_VAR = '--app-vh';

/** Шаг опроса размеров после поворота. */
const SETTLE_STEP_MS = 100;
/** Потолок опроса: на iOS 17+ анимация поворота длится заметно дольше 500 мс. */
const SETTLE_TIMEOUT_MS = 2000;
/** Столько одинаковых замеров подряд считаем «размеры устоялись». */
const STABLE_TICKS = 3;

/**
 * Пишет реально измеренную высоту видимого вьюпорта в `--app-vh` на :root.
 *
 * Оболочка дашборда не может опираться на `100dvh`: в standalone-PWA на iOS
 * layout viewport залипает смещённым — исторически после нативного пинча
 * (`.ai-factory/patches/2026-07-29-16.30.md`), а теперь и после поворота
 * экрана туда-обратно. Раскладка, привязанная к вьюпорту, перестаёт доставать
 * до низа экрана: снизу остаётся пустая полоса под нижней навигацией, и до
 * перезагрузки это не чинится. `visualViewport` сообщает фактически видимую
 * область, поэтому источник истины — он, а `100dvh` остаётся фолбэком первого
 * кадра (до монтирования) и окружений без `visualViewport`.
 *
 * После `orientationchange` размеры нельзя читать одним замером: WebKit отдаёт
 * череду промежуточных (ещё ландшафтных) значений, пока идёт анимация поворота,
 * и одиночное измерение зафиксировало бы ровно ту высоту, из-за которой баг и
 * возникает. Поэтому опрашиваем до стабилизации.
 *
 * (Раньше здесь же форсировался пересчёт `env(safe-area-inset-*)` через
 * переустановку `viewport-fit` cover↔auto. Сейчас вьюпорт — `auto` без cover
 * (см. layout.tsx), инсеты всегда 0, и форсить нечего.)
 */
export function useAppViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;

    const measure = () => window.visualViewport?.height ?? window.innerHeight;

    const apply = () => {
      const height = measure();
      // Ноль/NaN приходит на промежуточных кадрах поворота — записать его
      // значит схлопнуть всю оболочку.
      if (height > 0) {
        root.style.setProperty(APP_VIEWPORT_HEIGHT_VAR, `${height}px`);
      }
      return height;
    };

    let settleTimer = 0;
    const settle = () => {
      window.clearInterval(settleTimer);

      let last = apply();
      let stable = 0;
      let elapsed = 0;

      settleTimer = window.setInterval(() => {
        const height = apply();
        elapsed += SETTLE_STEP_MS;

        stable = height === last ? stable + 1 : 0;
        last = height;

        if (stable >= STABLE_TICKS || elapsed >= SETTLE_TIMEOUT_MS) {
          window.clearInterval(settleTimer);
        }
      }, SETTLE_STEP_MS);
    };

    apply();
    window.addEventListener('resize', settle);
    window.addEventListener('orientationchange', settle);
    window.visualViewport?.addEventListener('resize', settle);

    return () => {
      window.clearInterval(settleTimer);
      window.removeEventListener('resize', settle);
      window.removeEventListener('orientationchange', settle);
      window.visualViewport?.removeEventListener('resize', settle);
      root.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
    };
  }, []);
}
