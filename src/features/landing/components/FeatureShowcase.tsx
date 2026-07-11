'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { getBasePath } from '@/lib/utils';
import { revealItem, revealViewport } from './anim';

interface ShowcaseSection {
  id: 'plan' | 'reader' | 'songs' | 'offline';
  title: string;
  bullets: string[];
  /** Несколько файлов — автоматический кросс-фейд между кадрами (список ↔ деталь). */
  screenshots: string[];
}

const SECTIONS: ShowcaseSection[] = [
  {
    id: 'plan',
    title: 'План и календарь прогресса',
    bullets: [
      'Недельный план и календарь перед глазами',
      'Отметьте пропущенные дни разом',
      'Видно, где вы в плане — идите дальше',
    ],
    screenshots: ['screen-plan.webp'],
  },
  {
    id: 'reader',
    title: 'Читалка, которая не отвлекает',
    bullets: [
      'Крупный удобный шрифт — размер настраивается',
      'Светлая, тёмная тема и сепия',
      'Быстрый переход к любой книге и главе',
    ],
    screenshots: ['screen-reader.webp'],
  },
  {
    id: 'songs',
    title: 'Песни собрания',
    bullets: ['Аккорды над текстом', 'Быстрый поиск по названию', 'Крупный удобный шрифт'],
    screenshots: ['screen-song-view.webp', 'screen-song-list-view.webp'],
  },
  {
    id: 'offline',
    title: 'Всегда с собой — даже без сети',
    bullets: ['Скачайте один раз', 'Читайте офлайн — в метро, в дороге', 'Прогресс синхронизируется сам'],
    screenshots: ['screen-offline.webp'],
  },
];

/** Интервал автосмены кадров, когда у секции несколько скриншотов. */
const ROTATE_INTERVAL_MS = 4000;

const ShowcaseScreenshot: React.FC<{ srcs: string[]; alt: string }> = ({ srcs, alt }) => {
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const basePath = getBasePath();

  // Кросс-фейд list ↔ detail: чистая смена opacity (без движения), поэтому
  // допустим и при reduced-motion. Один кадр — таймер не нужен.
  useEffect(() => {
    if (srcs.length < 2 || failed) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % srcs.length), ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [srcs.length, failed]);

  return (
    <div className="relative mx-auto w-[240px] overflow-hidden rounded-[32px] border-[6px] border-[#0f0e0d] bg-app-bg shadow-app-card sm:w-[260px]">
      {failed ? (
        <div
          aria-hidden
          className="aspect-[390/844] w-full bg-gradient-to-br from-app-primary-light to-app-surface-muted"
        />
      ) : (
        <div className="relative aspect-[390/844] w-full">
          {srcs.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={`${basePath}/landing/${src}`}
              alt={i === 0 ? alt : ''}
              aria-hidden={i !== active}
              width={390}
              height={844}
              loading="lazy"
              className={
                'absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ' +
                (i === active ? 'opacity-100' : 'opacity-0')
              }
              onError={() => i === 0 && setFailed(true)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Зигзаг-секции со скриншотами приложения: текст и экран меняются сторонами
 * через секцию. На мобиле текст всегда идёт над скриншотом.
 */
export const FeatureShowcase: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-24" data-feature-showcase>
      <div className="flex flex-col gap-20 sm:gap-28">
        {SECTIONS.map(({ id, title, bullets, screenshots }, index) => {
          const reversed = index % 2 === 1;
          return (
            <motion.div
              key={id}
              className={
                'grid items-center gap-10 md:grid-cols-2 md:gap-14 ' +
                (reversed ? 'md:[&>*:first-child]:order-2' : '')
              }
              variants={revealItem}
              initial={reduceMotion ? false : 'hidden'}
              whileInView="show"
              viewport={revealViewport}
              data-feature-showcase-item={id}
            >
              <div className="text-center md:text-left">
                <h3 className="font-serif text-[clamp(26px,3.4vw,36px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
                  {title}
                </h3>
                <ul className="mx-auto mt-6 max-w-[38ch] space-y-3 md:mx-0">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex items-center justify-center gap-2.5 md:justify-start">
                      <Check size={17} strokeWidth={2.4} className="shrink-0 text-app-success" />
                      <span className="text-[15px] leading-relaxed text-app-text-secondary">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <ShowcaseScreenshot srcs={screenshots} alt={title} />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
