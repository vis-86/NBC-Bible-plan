import type { Variants } from 'motion/react';

/**
 * Общие in-view варианты для секций лендинга (About / HowToStart / InstallGuide /
 * FinalCta). Используются как `whileInView` со `staggerChildren`. Reduced-motion
 * каждая секция обрабатывает сама через `initial={reduceMotion ? false : 'hidden'}`.
 */
export const revealContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } },
};

/** Единые viewport-настройки: проигрываем один раз, чуть раньше входа в кадр. */
export const revealViewport = { once: true, margin: '-80px' } as const;
