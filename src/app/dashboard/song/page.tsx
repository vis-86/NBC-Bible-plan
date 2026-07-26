'use client';

import { Suspense, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSong } from '@/features/songs/hooks/useSong';
import { useSongViewSettings, SONG_WIDE_LAYOUT_QUERY } from '@/features/songs/hooks/useSongViewSettings';
import { SongView } from '@/features/songs/components/SongView';
import { SongKeyPicker } from '@/features/songs/components/SongKeyPicker';
import { SongViewSettings } from '@/features/songs/components/SongViewSettings';
import { SongAutoScroll } from '@/features/songs/components/SongAutoScroll';
import { useSongKey } from '@/features/songs/hooks/useSongKey';
import { useAutoScroll } from '@/features/songs/hooks/useAutoScroll';
import { useAutoHideOnScroll } from '@/shared/hooks/useAutoHideOnScroll';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useHorizontalSwipe } from '@/shared/hooks/useHorizontalSwipe';
import { useSetlistPlayback } from '@/features/setlists/hooks/useSetlistPlayback';
import { SetlistPlaybackSheet } from '@/features/setlists/components/SetlistPlaybackSheet';
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
  const setlistId = searchParams.get('setlistId');

  const { song, loading, error } = useSong(id);
  const contentRef = useRef<HTMLDivElement>(null);
  const { hidden, ignoreNextScroll } = useAutoHideOnScroll(contentRef, song?.id);
  const [viewSettings, setViewSettings] = useSongViewSettings();
  const [isViewSettingsOpen, setIsViewSettingsOpen] = useState(false);
  const [isKeyPickerOpen, setIsKeyPickerOpen] = useState(false);
  const [isSetlistSheetOpen, setIsSetlistSheetOpen] = useState(false);
  const songKeyState = useSongKey(song);
  const playback = useSetlistPlayback(setlistId, id);
  // В режиме «только текст» аккордов на экране нет — тональность ни на что не влияет
  // и селектор не показывается. Выбирать не из чего — тоже (нераспознанная тональность).
  const showKeyPicker = viewSettings.showChords && Boolean(songKeyState.effectiveKey) && songKeyState.options.length > 0;

  // Постраничные режимы существуют только там, где панель настроек их показывает
  // (та же константа) — иначе сохранённый на планшете `sheets` включится на телефоне,
  // где контрола нет и выключить его нечем.
  const isWideLayout = useMediaQuery(SONG_WIDE_LAYOUT_QUERY);
  const mode = isWideLayout ? viewSettings.mode : 'scroll';
  // Автоскрытие шапки меняет высоту вьюпорта — в постраничных режимах это
  // пересборка листов на каждый скролл, поэтому шапка там всегда видна.
  const headerHidden = mode === 'scroll' ? hidden : false;

  // Автоскролл активен только в режиме scroll при загруженной песне (§4.5, §8).
  // Скорость — per-song device-local настройка (autoScrollSpeedStore).
  // ignoreNextScroll гасит реакцию useScrollDirection на программный сдвиг scrollTop.
  const autoscroll = useAutoScroll({
    containerRef: contentRef,
    songId: song?.id ?? '',
    enabled: mode === 'scroll' && !!song,
    onBeforeProgrammaticScroll: ignoreNextScroll,
  });

  // Переход к соседней песне сета: сброс scrollTop (компонент не размонтируется —
  // без сброса новая песня открылась бы с середины), пауза автоскролла (скорость
  // per-song подхватится своя, но продолжать ехать по новой песне — неверно),
  // и router.replace (не push — иначе back после N свайпов прогонит N песен).
  const navigateToSetlistSong = (songId: number) => {
    ignoreNextScroll();
    if (contentRef.current) contentRef.current.scrollTop = 0;
    autoscroll.pause();
    playback.goTo(songId);
  };

  // Свайп между песнями активен только в mode='scroll' — 'paged' уже занял горизонталь
  // листанием страниц одной песни (usePagedFlow), конфликтовать с ним нельзя.
  const swipeHandlers = useHorizontalSwipe({
    enabled: playback.inSetlist && mode === 'scroll',
    onSwipeLeft: () => {
      if (playback.nextId != null) navigateToSetlistSong(playback.nextId);
    },
    onSwipeRight: () => {
      if (playback.prevId != null) navigateToSetlistSong(playback.prevId);
    },
  });

  const handleBack = () =>
    playback.inSetlist && setlistId
      ? router.push(`/dashboard/setlist?id=${encodeURIComponent(setlistId)}`)
      : router.push('/dashboard/songs');

  return (
    // hideBottomNav — фокус-режим чтения: нижняя навигация скрыта.
    <DashboardLayout onChangeView={() => {}} hideBottomNav>
      <div data-song-page className="relative flex min-h-0 flex-1 flex-col">
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
                <div className="flex items-center gap-1">
                  {playback.inSetlist && (
                    <>
                      <button
                        type="button"
                        data-song-page-setlist-prev
                        aria-label="Предыдущая песня сета"
                        disabled={playback.prevId == null}
                        onClick={() => playback.prevId != null && navigateToSetlistSong(playback.prevId)}
                        className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <button
                        type="button"
                        data-song-page-setlist-counter
                        aria-label={`Песня ${playback.index + 1} из ${playback.total}, открыть список сета`}
                        onClick={() => setIsSetlistSheetOpen(true)}
                        className="rounded-app-sm px-1.5 py-2 text-sm font-medium text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95"
                      >
                        {playback.index + 1} / {playback.total}
                      </button>
                      <button
                        type="button"
                        data-song-page-setlist-next
                        aria-label="Следующая песня сета"
                        disabled={playback.nextId == null}
                        onClick={() => playback.nextId != null && navigateToSetlistSong(playback.nextId)}
                        className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  )}
                  {song && showKeyPicker && (
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
                      onOpenChange={setIsKeyPickerOpen}
                    />
                  )}
                  <button
                    type="button"
                    data-song-page-view-settings-button
                    aria-label="Настройки просмотра"
                    onClick={() => setIsViewSettingsOpen(true)}
                    className="rounded-app-sm p-2 text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
                  >
                    <Settings size={20} />
                  </button>
                </div>
              }
            />
          </div>
        </div>

        {/* В постраничных режимах боковое поле целиком отдано корню песни
            (`px-4` в SongView): подложка листа тянется до края оболочки, а поле
            остаётся внутри листа — текст не впритык к его краю. */}
        <div
          ref={contentRef}
          className={cn('min-h-0 flex-1 overflow-y-auto', mode === 'scroll' ? 'px-4 py-4' : 'py-2')}
          {...swipeHandlers}
        >
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
              // songKey — тональность ФОРМ на листе (при капо ≠ звучащей): она задаёт спеллинг
              // диезов/бемолей, обязанный совпадать с реально напечатанными аккордами.
              songKey={songKeyState.shapeKey ?? songKeyState.effectiveKey ?? song.key}
              // metaKey — ЗВУЧАЩАЯ тональность для плашки key·tempo.
              metaKey={songKeyState.effectiveKey ?? song.key}
              // renderSemitones уже учитывает капо (semitones − capo).
              semitones={songKeyState.renderSemitones}
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

        {/* FAB автоскролла — сиблинг скролл-контейнера (не внутри него): слушатель паузы
            висит на контейнере, а тап по FAB внутри всплыл бы в touchstart → пауза на play.
            Только в scroll при загруженной песне; на showChords не гейтим (§4.5).
            Прячем при любой открытой нижней шторке на странице песни (настройки ИЛИ
            транспонирование), иначе контрол перекрывает лист. */}
        {mode === 'scroll' && song && !isViewSettingsOpen && !isKeyPickerOpen && !isSetlistSheetOpen && (
          <SongAutoScroll
            playing={autoscroll.playing}
            step={autoscroll.step}
            canScroll={autoscroll.canScroll}
            onToggle={autoscroll.toggle}
            onSetStep={autoscroll.setStep}
          />
        )}
      </div>

      <SongViewSettings
        isOpen={isViewSettingsOpen}
        onClose={() => setIsViewSettingsOpen(false)}
        settings={viewSettings}
        onSettingsChange={setViewSettings}
      />

      {playback.inSetlist && (
        <SetlistPlaybackSheet
          isOpen={isSetlistSheetOpen}
          onClose={() => setIsSetlistSheetOpen(false)}
          items={playback.items}
          currentSongId={typeof id === 'string' ? Number(id) : id}
          onSelect={(songId) => {
            setIsSetlistSheetOpen(false);
            navigateToSetlistSong(songId);
          }}
        />
      )}
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
