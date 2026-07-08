'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSongs } from '@/features/songs/hooks/useSongs';
import { useSongSearch } from '@/features/songs/hooks/useSongSearch';
import { SearchBar } from '@/features/songs/components/SearchBar';
import { SongList } from '@/features/songs/components/SongList';
import { useAutoHideOnScroll } from '@/shared/hooks/useAutoHideOnScroll';
import { useChromeVisibility } from '@/shared/components/layout/ChromeVisibility';
import { useScrollRestore } from '@/features/songs/hooks/useScrollRestore';

const LIST_SCROLL_KEY = 'songs:list-scroll';
const LIST_QUERY_KEY = 'songs:list-query';

function readInitialQuery(): string {
  // Лениво читается в useState-инициализаторе, который вызывается и на серверном
  // рендере статической страницы (sessionStorage там не определён) — это не
  // ошибка окружения, просто нет клиентского контекста, тихий фолбэк.
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(LIST_QUERY_KEY) ?? '';
  } catch (err) {
    console.warn('[SongsPage] sessionStorage unavailable', err);
    return '';
  }
}

/**
 * Вынесено из SongsPage: useChromeVisibility требует ChromeVisibilityProvider,
 * который живёт внутри DashboardLayout — вызов хука в самой SongsPage упал бы.
 */
function SongsPageContent() {
  const { songs, loading, error } = useSongs();
  const [query, setQuery] = useState(readInitialQuery);
  const listRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[SongsPage] search query="${q}"`);
    }
    try {
      sessionStorage.setItem(LIST_QUERY_KEY, q);
    } catch (err) {
      console.warn('[SongsPage] sessionStorage unavailable', err);
    }
  }, []);

  const results = useSongSearch(songs, query);

  const { hidden, ignoreNextScroll } = useAutoHideOnScroll(listRef, results.length);
  const { setChromeHidden } = useChromeVisibility();

  useEffect(() => {
    setChromeHidden(hidden);
  }, [hidden, setChromeHidden]);

  useEffect(() => {
    return () => setChromeHidden(false);
  }, [setChromeHidden]);

  // ignoreNextScroll обязателен: без него программное выставление scrollTop
  // при восстановлении даст большую положительную дельту и нижняя навигация
  // мгновенно спрячется при входе на страницу.
  useScrollRestore(listRef, LIST_SCROLL_KEY, !loading && results.length > 0, ignoreNextScroll);

  return (
    <div data-songs-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader variant="page" title="Песни">
        <SearchBar onSearch={handleSearch} initialValue={query} />
      </PageHeader>

      {/* pt-3: список не должен липнуть к строке поиска в шапке. */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        {error ? (
          <ErrorMessage message={error} />
        ) : loading && songs.length === 0 ? (
          <ul data-songs-loading className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="h-[60px] animate-pulse rounded-xl border border-app-border bg-app-surface-muted" />
            ))}
          </ul>
        ) : (
          <SongList songs={results} />
        )}
      </div>
    </div>
  );
}

export default function SongsPage() {
  return (
    <DashboardLayout onChangeView={() => {}}>
      <SongsPageContent />
    </DashboardLayout>
  );
}
