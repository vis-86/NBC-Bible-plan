'use client';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { partitionSetlists } from '../lib/archive';
import type { SetlistSummary } from '../types';
import { SetlistCard } from './SetlistCard';

interface SetlistsListProps {
  setlists: SetlistSummary[];
  /** ISO `YYYY-MM-DD`, инжектируется вызывающим — упрощает тесты (не завязано на `Date.now()`). */
  todayISO: string;
  canManageSetlists: boolean;
}

function SetlistGroup({ title, items }: { title?: string; items: SetlistSummary[] }) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;

  return (
    <section data-setlist-group className="space-y-2">
      {title && <h2 className="text-sm font-medium text-app-text-secondary">{title}</h2>}
      <ul className="flex flex-col gap-2">
        {items.map((setlist, i) => (
          <motion.li
            key={setlist.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i * 0.015, 0.3) }}
          >
            <SetlistCard setlist={setlist} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** Список сетов, разбитый на «Ближайшие»/«Без даты»/«Архив» (см. `partitionSetlists`). */
export const SetlistsList: React.FC<SetlistsListProps> = ({ setlists, todayISO, canManageSetlists }) => {
  const router = useRouter();
  const { upcoming, undated, past } = partitionSetlists(setlists, todayISO);

  console.debug(
    `[SetlistsPage] loaded ${setlists.length} setlists (upcoming=${upcoming.length}/undated=${undated.length}/past=${past.length})`
  );

  if (setlists.length === 0) {
    return (
      <div data-setlists-empty className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-app-text-muted">Сетов пока нет</p>
        {canManageSetlists && (
          <button
            type="button"
            data-setlists-create-button
            onClick={() => router.push('/dashboard/setlist-edit')}
            className="rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse transition-transform active:scale-95"
          >
            Создать сет
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SetlistGroup title="Ближайшие" items={upcoming} />
      <SetlistGroup title="Без даты" items={undated} />

      {past.length > 0 && (
        <details data-setlist-archive className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-app-text-secondary [&::-webkit-details-marker]:hidden">
            <span>Архив ({past.length})</span>
            <span className="text-app-text-muted transition-transform group-open:rotate-180" aria-hidden>
              ▼
            </span>
          </summary>
          <div className="mt-2">
            <SetlistGroup items={past} />
          </div>
        </details>
      )}
    </div>
  );
};

export default SetlistsList;
