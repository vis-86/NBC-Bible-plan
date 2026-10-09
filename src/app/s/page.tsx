'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { FullScreenLoader } from '@/shared/components/ui/FullScreenLoader';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { usePublicSong } from '@/features/songs/hooks/usePublicSong';
import { useSongKey } from '@/features/songs/hooks/useSongKey';
import { useSongViewSettings, resolveSongViewMode, SONG_WIDE_LAYOUT_QUERY } from '@/features/songs/hooks/useSongViewSettings';
import { SongView } from '@/features/songs/components/SongView';
import { SongKeyPicker } from '@/features/songs/components/SongKeyPicker';
import { SongViewSettings } from '@/features/songs/components/SongViewSettings';
import { resolveChordColor } from '@/features/songs/lib/chordColors';
import { cn } from '@/shared/utils/cn';

/**
 * Ссылка «Поделиться» (`/s?id=`). Вошедший (в т.ч. офлайн по last-known-user) сразу уходит
 * в `/dashboard/song` — там офлайн-чтение и все инструменты. Гость видит read-only лист
 * с тональностью и настройками вида, если песня открыта всем (`songs.visibility`).
 */
function PublicSongContent() {
  const router = useRouter();
  const id = useSearchParams().get('id') ?? '';
  const { user, loading: authLoading } = useAuth();
  // Песня гостю запрашивается сразу, параллельно с проверкой сессии: ожидание — max двух
  // запросов, а не сумма. У вошедшего ответ просто не пригодится (он уходит в дашборд).
  const publicSong = usePublicSong(id);

  // Не ждём `!authLoading`: `user` из last-known-user появляется до ответа сети, и
  // песня открывается из IDB сразу. Протухшую сессию поймает гард дашборда.
  useEffect(() => {
    if (user && id) router.replace(`/dashboard/song?id=${encodeURIComponent(id)}`);
  }, [user, id, router]);

  if (!id) {
    return (
      <PublicSongShell title="Песня">
        <ErrorMessage title="Ссылка неполная" message="В ссылке нет номера песни." />
      </PublicSongShell>
    );
  }
  if (authLoading || user) return <FullScreenLoader label="Открываем песню…" />;
  return <GuestSong id={id} {...publicSong} />;
}

function GuestSong({ id, state, retry }: { id: string } & ReturnType<typeof usePublicSong>) {
  const router = useRouter();
  const song = state.status === 'ready' ? state.song : null;
  const songKeyState = useSongKey(song);
  const [viewSettings, setViewSettings] = useSongViewSettings();
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
  const isWideLayout = useMediaQuery(SONG_WIDE_LAYOUT_QUERY);
  const mode = resolveSongViewMode(viewSettings.columns, isWideLayout);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (song) document.title = song.title;
  }, [song]);

  const showKeyPicker = viewSettings.showChords && Boolean(songKeyState.effectiveKey) && songKeyState.options.length > 0;

  const actions = song && (
    <div className="flex items-center gap-1">
      {showKeyPicker && (
        <SongKeyPicker
          value={songKeyState.effectiveKey as string}
          source={songKeyState.source}
          originalKey={song.key}
          options={songKeyState.options}
          onChange={songKeyState.setKey}
          onReset={songKeyState.resetKey}
          capo={songKeyState.capo}
          onCapoChange={songKeyState.setCapo}
          shapeKey={songKeyState.shapeKey}
        />
      )}
      <button
        type="button"
        data-public-song-view-settings-button
        aria-label="Настройки просмотра"
        onClick={() => setIsViewSettingsOpen(true)}
        className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
      >
        <Settings size={20} />
      </button>
    </div>
  );

  return (
    <PublicSongShell title={song?.title ?? 'Песня'} right={actions} contentRef={contentRef} padded={mode === 'scroll'}>
      {state.status === 'loading' && (
        <div data-public-song-loading className="flex justify-center pt-16">
          <LoadingSpinner size={32} />
        </div>
      )}
      {state.status === 'unavailable' && (
        <ErrorMessage
          title="Песня недоступна"
          message="Её нет по этой ссылке, или она открыта только участникам церкви."
          onRetry={() => router.push(`/login?redirect=${encodeURIComponent(`/dashboard/song?id=${id}`)}`)}
          retryLabel="Войти"
        />
      )}
      {state.status === 'offline' && (
        <ErrorMessage title="Нет интернета" message="Чтобы открыть песню по ссылке, нужен интернет." onRetry={retry} retryLabel="Повторить" />
      )}
      {state.status === 'error' && (
        <ErrorMessage title="Не удалось загрузить" message="Проверьте интернет и попробуйте ещё раз." onRetry={retry} retryLabel="Повторить" />
      )}
      {song && (
        <div data-public-song className="animate-content-in">
          <SongView
            content={song.content}
            subtitle={song.subtitle}
            songKey={songKeyState.shapeKey ?? songKeyState.effectiveKey ?? song.key}
            metaKey={songKeyState.effectiveKey ?? song.key}
            semitones={songKeyState.renderSemitones}
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
      )}
      <SongViewSettings
        isOpen={isViewSettingsOpen}
        onClose={() => setIsViewSettingsOpen(false)}
        settings={viewSettings}
        onSettingsChange={setViewSettings}
      />
    </PublicSongShell>
  );
}

interface PublicSongShellProps {
  title: string;
  right?: React.ReactNode;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  padded?: boolean;
  children: React.ReactNode;
}

/** Оболочка без навигации дашборда: у гостя её нет, у вошедшего сюда не попадают. */
function PublicSongShell({ title, right, contentRef, padded = true, children }: PublicSongShellProps) {
  return (
    <div data-public-song-page className="fixed inset-0 flex flex-col bg-app-bg">
      <div className="bg-app-surface pt-safe">
        <PageHeader title={title} density="compact" right={right} sticky={false} />
      </div>
      <div ref={contentRef} className={cn('min-h-0 flex-1 overflow-y-auto', padded ? 'px-4 py-4' : 'py-2')}>
        {children}
      </div>
    </div>
  );
}

export default function PublicSongPage() {
  return (
    <Suspense fallback={<FullScreenLoader label="Открываем песню…" />}>
      <PublicSongContent />
    </Suspense>
  );
}
