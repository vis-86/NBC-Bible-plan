'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';

interface ChipItem {
  songId: number;
  title: string;
}

interface SelectedChipsRowProps {
  items: ChipItem[];
  onRemove: (songId: number) => void;
}

/** Лента выбранных песен-чипов над списком (только на мобильном, N ≥ 1). Скроллится к новому chip. */
export const SelectedChipsRow: React.FC<SelectedChipsRowProps> = ({ items, onRemove }) => {
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(items.length);

  useEffect(() => {
    // jsdom (тесты) не реализует scrollTo — гард без охоты за window.HTMLElement.prototype.
    if (items.length > prevCount.current && scrollRef.current?.scrollTo) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    prevCount.current = items.length;
  }, [items.length, reduceMotion]);

  if (items.length === 0) return null;

  return (
    <div ref={scrollRef} data-setlist-builder-chips className="flex gap-2 overflow-x-auto px-4 py-2">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.button
            key={item.songId}
            type="button"
            data-setlist-builder-chip
            aria-label={`Убрать «${item.title}» из сета`}
            onClick={() => onRemove(item.songId)}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            // Хит-область ✕ расширена паддингом самой кнопки (≥44px по высоте), не увеличивая
            // визуальный размер чипа — иначе соседние чипы теряют зазор ≥8px.
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-app-primary-muted py-2.5 pl-3 pr-2.5 text-sm font-medium text-app-primary"
          >
            <span className="max-w-[10rem] truncate">{item.title}</span>
            <X size={14} aria-hidden />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default SelectedChipsRow;
