'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { getBasePath } from '@/lib/utils';
import { revealItem, revealViewport } from './anim';

interface ShowcaseSection {
  id: 'plan' | 'songs' | 'offline';
  title: string;
  bullets: string[];
  screenshot: string;
}

const SECTIONS: ShowcaseSection[] = [
  {
    id: 'plan',
    title: 'План на каждый день',
    bullets: ['Недельный план перед глазами', 'Отметка глав одним касанием', 'Календарь прогресса'],
    screenshot: 'screen-plan.png',
  },
  {
    id: 'songs',
    title: 'Песни собрания',
    bullets: ['Аккорды над текстом', 'Быстрый поиск по названию', 'Крупный удобный шрифт'],
    screenshot: 'screen-song-view.png',
  },
  {
    id: 'offline',
    title: 'Всегда с собой — даже без сети',
    bullets: ['Скачайте один раз', 'Читайте офлайн — в метро, в дороге', 'Прогресс синхронизируется сам'],
    screenshot: 'screen-offline.png',
  },
];

const ShowcaseScreenshot: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  const basePath = getBasePath();

  return (
    <div className="relative mx-auto w-[240px] overflow-hidden rounded-[32px] border-[6px] border-[#0f0e0d] bg-app-bg shadow-app-md sm:w-[260px]">
      {failed ? (
        <div
          aria-hidden
          className="aspect-[390/844] w-full bg-gradient-to-br from-app-primary-light to-app-surface-muted"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${basePath}/landing/${src}`}
          alt={alt}
          width={390}
          height={844}
          loading="lazy"
          className="aspect-[390/844] w-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
};

/**
 * Зигзаг-секции со скриншотами приложения (паттерн YouVersion, адаптированный
 * под Sacred Minimal): текст и экран меняются сторонами через секцию.
 * На мобиле текст всегда идёт над скриншотом.
 */
export const FeatureShowcase: React.FC = () => {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <section className="py-16 sm:py-20" data-feature-showcase>
      <div className="flex flex-col gap-16 sm:gap-24">
        {SECTIONS.map(({ id, title, bullets, screenshot }, index) => {
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
                <h3 className="font-serif text-[clamp(26px,3.4vw,34px)] font-medium leading-tight tracking-[-0.02em] text-app-text">
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

              <ShowcaseScreenshot src={screenshot} alt={title} />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
