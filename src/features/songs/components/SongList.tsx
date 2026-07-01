'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { SongSummary } from '../types';
import { SongCard } from './SongCard';

interface SongListProps {
  songs: SongSummary[];
}

/** Список карточек песен с лёгкой анимацией появления (уважает reduce-motion). */
export const SongList: React.FC<SongListProps> = ({ songs }) => {
  const reduceMotion = useReducedMotion();

  if (songs.length === 0) {
    return (
      <div data-song-list-empty className="py-16 text-center text-app-text-muted">
        Ничего не найдено
      </div>
    );
  }

  return (
    <ul data-song-list className="flex flex-col gap-2">
      {songs.map((song, i) => (
        <motion.li
          key={song.id}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i * 0.015, 0.3) }}
        >
          <SongCard song={song} />
        </motion.li>
      ))}
    </ul>
  );
};

export default SongList;
