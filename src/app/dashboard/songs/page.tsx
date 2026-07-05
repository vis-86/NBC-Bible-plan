'use client';

import { useCallback, useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSongs } from '@/features/songs/hooks/useSongs';
import { useSongSearch } from '@/features/songs/hooks/useSongSearch';
import { SearchBar } from '@/features/songs/components/SearchBar';
import { SongList } from '@/features/songs/components/SongList';

export default function SongsPage() {
  const { songs, loading, error } = useSongs();
  const [query, setQuery] = useState('');

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[SongsPage] search query="${q}"`);
    }
  }, []);

  const results = useSongSearch(songs, query);

  return (
    <DashboardLayout onChangeView={() => {}}>
      <div data-songs-page className="flex min-h-0 flex-1 flex-col">
        <PageHeader variant="page" title="Песни">
          <SearchBar onSearch={handleSearch} />
        </PageHeader>

        {/* pt-3: список не должен липнуть к строке поиска в шапке. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
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
    </DashboardLayout>
  );
}
