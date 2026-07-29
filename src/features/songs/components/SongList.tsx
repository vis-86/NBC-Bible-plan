'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { SongSearchHit } from '../hooks/useSongSearch';
import { SongCard } from './SongCard';

interface SongListProps {
  hits: SongSearchHit[];
}

/** Список карточек песен с лёгкой анимацией появления (уважает reduce-motion). */
export const SongList: React.FC<SongListProps> = ({ hits }) => {
  const reduceMotion = useReducedMotion();

  if (hits.length === 0) {
    return (
      <div data-song-list-empty className="py-16 text-center text-app-text-muted">
        Ничего не найдено
      </div>
    );
  }

  return (
    <ul data-song-list className="flex flex-col gap-2">
      {hits.map((hit, i) => (
        <motion.li
          key={hit.song.id}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i * 0.015, 0.3) }}
        >
          <SongCard song={hit.song} snippet={hit.snippet} />
        </motion.li>
      ))}
    </ul>
  );
};

export default SongList;
