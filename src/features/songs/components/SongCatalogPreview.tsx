'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { usePublicSong } from '../hooks/usePublicSong';
import { useCopyCatalogSong } from '../hooks/useCopyCatalogSong';
import { useSongKey } from '../hooks/useSongKey';
import { useSongViewSettings, resolveSongViewMode, SONG_WIDE_LAYOUT_QUERY } from '../hooks/useSongViewSettings';
import { resolveChordColor } from '../lib/chordColors';
import { SongView } from './SongView';

interface SongCatalogPreviewProps {
  id: string;
}

/** Read-only лист песни из каталога + «Скопировать к себе». */
export function SongCatalogPreview({ id }: SongCatalogPreviewProps) {
  const router = useRouter();
  const { state, retry } = usePublicSong(id);
  const { copy, submitting } = useCopyCatalogSong();
  const [message, setMessage] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const song = state.status === 'ready' ? state.song : null;
  const keyState = useSongKey(song);
  const [viewSettings] = useSongViewSettings();
  const isWideLayout = useMediaQuery(SONG_WIDE_LAYOUT_QUERY);
  const mode = resolveSongViewMode(viewSettings.columns, isWideLayout);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    setMessage(null);
    const result = await copy(id);
    if (result.status === 'copied' || result.status === 'existing') {
      router.push(`/dashboard/song?id=${encodeURIComponent(result.id)}`);
    } else if (result.status === 'gone') {
      setGone(true);
    } else {
      setMessage(result.message);
    }
  };

  if (gone || state.status === 'unavailable') {
    return (
      <div data-song-catalog-gone className="p-4">
        <ErrorMessage title="Песня недоступна" message="Песня больше недоступна в каталоге." />
      </div>
    );
  }
  if (state.status === 'offline') {
    return (
      <ErrorMessage title="Нет интернета" message="Каталог доступен только с интернетом." onRetry={retry} retryLabel="Повторить" />
    );
  }
  if (state.status === 'error') {
    return <ErrorMessage title="Не удалось загрузить" message="Проверьте интернет и попробуйте ещё раз." onRetry={retry} retryLabel="Повторить" />;
  }
  if (!song) {
    return (
      <div data-song-catalog-loading className="flex justify-center pt-16">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  return (
    <div data-song-catalog-preview className="flex min-h-0 flex-1 flex-col">
      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <SongView
          content={song.content}
          subtitle={song.subtitle}
          songKey={keyState.shapeKey ?? keyState.effectiveKey ?? song.key}
          metaKey={keyState.effectiveKey ?? song.key}
          semitones={keyState.renderSemitones}
          tempo={song.tempo}
          fontSize={viewSettings.fontSize}
          hideChords={!viewSettings.showChords}
          chordDisplay={viewSettings.chordDisplay}
          chordColor={resolveChordColor(viewSettings.chordColor)}
          chordScale={viewSettings.chordScale / 100}
          density={viewSettings.density}
          showHeader={viewSettings.showHeader}
          mode={mode}
          columns={viewSettings.columns}
          wideLayout={isWideLayout}
          viewportRef={contentRef}
        />
      </div>
      <div className="border-t border-app-border bg-app-surface px-4 py-3 pb-nav">
        {message && (
          <p data-song-catalog-error role="alert" className="mb-2 text-sm text-app-accent">
            {message}
          </p>
        )}
        <button
          type="button"
          data-song-catalog-copy-button
          disabled={submitting}
          onClick={handleCopy}
          className="w-full rounded-app-md bg-app-primary px-4 py-3 text-sm font-medium text-app-text-inverse disabled:opacity-60"
        >
          {submitting ? 'Копируем…' : 'Скопировать к себе'}
        </button>
      </div>
    </div>
  );
}
