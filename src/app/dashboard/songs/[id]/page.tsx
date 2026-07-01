'use client';

import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSong } from '@/features/songs/hooks/useSong';
import { SongView } from '@/features/songs/components/SongView';

export default function SongPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { song, loading, error } = useSong(id);

  const handleBack = () => router.push('/dashboard/songs');

  return (
    // hideBottomNav — фокус-режим чтения (как /read/): нижняя навигация скрыта.
    <DashboardLayout onChangeView={() => {}} hideBottomNav>
      <div data-song-page className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-app-border px-2 py-2">
          <button
            type="button"
            data-song-page-back
            onClick={handleBack}
            aria-label="Назад к списку"
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-app-text-secondary transition-colors hover:text-app-text active:scale-95"
          >
            <ChevronLeft size={22} />
            <span className="text-sm font-medium">Песни</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {error ? (
            <ErrorMessage title="Песня не найдена" message={error} onRetry={handleBack} retryLabel="К списку" />
          ) : loading || !song ? (
            <div data-song-page-loading className="animate-pulse space-y-3" aria-hidden>
              <div className="h-7 w-2/3 rounded bg-app-surface-muted" />
              <div className="h-4 w-1/2 rounded bg-app-surface-muted" />
              <div className="mt-6 h-4 w-full rounded bg-app-surface-muted" />
              <div className="h-4 w-11/12 rounded bg-app-surface-muted" />
              <div className="h-4 w-10/12 rounded bg-app-surface-muted" />
            </div>
          ) : (
            <SongView
              content={song.content}
              title={song.title}
              subtitle={song.subtitle}
              songKey={song.key}
              tempo={song.tempo}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
