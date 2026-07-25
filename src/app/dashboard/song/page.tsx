'use client';

import { Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSong } from '@/features/songs/hooks/useSong';
import { useSongViewSettings, SONG_WIDE_LAYOUT_QUERY } from '@/features/songs/hooks/useSongViewSettings';
import { SongView } from '@/features/songs/components/SongView';
import { SongViewSettings } from '@/features/songs/components/SongViewSettings';
import { useAutoHideOnScroll } from '@/shared/hooks/useAutoHideOnScroll';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/utils/cn';

/**
 * Единый клиентский маршрут детали песни (approach C): id живёт в search-параметре,
 * а не в сегменте `songs/[id]`. Search не меняет сегмент маршрута → один документ
 * `/dashboard/song` (прогретый в HTML-кеш + отдаваемый SW по ignoreSearch) открывает
 * любую песню офлайн. Данные тянутся из IDB через useSong (readSongThrough).
 */
function SongPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';

  const { song, loading, error } = useSong(id);
  const contentRef = useRef<HTMLDivElement>(null);
  const { hidden } = useAutoHideOnScroll(contentRef, song?.id);
  const [viewSettings, setViewSettings] = useSongViewSettings();
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);

  // Постраничные режимы существуют только там, где панель настроек их показывает
  // (та же константа) — иначе сохранённый на планшете `sheets` включится на телефоне,
  // где контрола нет и выключить его нечем.
  const isWideLayout = useMediaQuery(SONG_WIDE_LAYOUT_QUERY);
  const mode = isWideLayout ? viewSettings.mode : 'scroll';
  // Автоскрытие шапки меняет высоту вьюпорта — в постраничных режимах это
  // пересборка листов на каждый скролл, поэтому шапка там всегда видна.
  const headerHidden = mode === 'scroll' ? hidden : false;

  const handleBack = () => router.push('/dashboard/songs');

  return (
    // hideBottomNav — фокус-режим чтения: нижняя навигация скрыта.
    <DashboardLayout onChangeView={() => {}} hideBottomNav>
      <div data-song-page className="flex min-h-0 flex-1 flex-col">
        {/* grid-rows 0fr↔1fr анимирует высоту без измерения. pt-safe в скрытом
            состоянии сохраняет закрашенную полоску брови (PageHeader несёт
            свой pt-safe-3 только когда виден) — инвариант «бровь = цвет шапки». */}
        <div
          data-song-page-header-collapse
          className={cn(
            'grid bg-app-surface transition-[grid-template-rows,padding] duration-300 ease-out',
            headerHidden ? 'grid-rows-[0fr] pt-safe' : 'grid-rows-[1fr] pt-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <PageHeader
              title={song?.title ?? ''}
              onBack={handleBack}
              backAriaLabel="Назад к списку"
              right={
                <button
                  type="button"
                  data-song-page-view-settings-button
                  aria-label="Настройки просмотра"
                  onClick={() => setIsViewSettingsOpen(true)}
                  className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
                >
                  <Settings size={20} />
                </button>
              }
            />
          </div>
        </div>

        {/* В постраничных режимах поле отдано корню песни (`p-2` в SongView):
            страница считается от его края, а не от края скролл-контейнера. */}
        <div ref={contentRef} className={cn('min-h-0 flex-1 overflow-y-auto', mode === 'scroll' ? 'px-4 py-4' : 'px-2 py-2')}>
          {!id ? (
            <ErrorMessage title="Песня не найдена" message="Не указан идентификатор песни." onRetry={handleBack} retryLabel="К списку" />
          ) : error ? (
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
              // title не прокидываем: он уже показан в PageHeader сверху (без дубля).
              content={song.content}
              subtitle={song.subtitle}
              songKey={song.key}
              tempo={song.tempo}
              fontSize={viewSettings.fontSize}
              hideChords={!viewSettings.showChords}
              density={viewSettings.density}
              showHeader={viewSettings.showHeader}
              mode={mode}
              columns={viewSettings.columns}
              viewportRef={contentRef}
            />
          )}
        </div>
      </div>

      <SongViewSettings
        isOpen={isViewSettingsOpen}
        onClose={() => setIsViewSettingsOpen(false)}
        settings={viewSettings}
        onSettingsChange={setViewSettings}
      />
    </DashboardLayout>
  );
}

export default function SongPage() {
  // useSearchParams требует Suspense-границу в App Router.
  return (
    <Suspense
      fallback={
        <DashboardLayout onChangeView={() => {}} hideBottomNav>
          <div data-song-page className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <div className="animate-pulse space-y-3" aria-hidden>
                <div className="h-7 w-2/3 rounded bg-app-surface-muted" />
                <div className="h-4 w-1/2 rounded bg-app-surface-muted" />
              </div>
            </div>
          </div>
        </DashboardLayout>
      }
    >
      <SongPageContent />
    </Suspense>
  );
}
