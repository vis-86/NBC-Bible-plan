'use client';

import { Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSong } from '@/features/songs/hooks/useSong';
import { SongView } from '@/features/songs/components/SongView';
import { useAutoHideOnScroll } from '@/shared/hooks/useAutoHideOnScroll';
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
            hidden ? 'grid-rows-[0fr] pt-safe' : 'grid-rows-[1fr] pt-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <PageHeader title={song?.title ?? ''} onBack={handleBack} backAriaLabel="Назад к списку" />
          </div>
        </div>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
            />
          )}
        </div>
      </div>
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
