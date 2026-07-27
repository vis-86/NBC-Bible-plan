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
import { SongKeyPicker } from '@/features/songs/components/SongKeyPicker';
import { SongViewSettings } from '@/features/songs/components/SongViewSettings';
import { SongAutoScroll } from '@/features/songs/components/SongAutoScroll';
import { SongToolStack } from '@/features/songs/components/SongToolStack';
import { useSongKey } from '@/features/songs/hooks/useSongKey';
import { useAutoScroll } from '@/features/songs/hooks/useAutoScroll';
import { useAutoHideOnScroll } from '@/shared/hooks/useAutoHideOnScroll';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { SwipePager } from '@/shared/components/pager/SwipePager';
import { PagerHint, usePagerHint } from '@/shared/components/pager/PagerHint';
import { useSetlistPlayback } from '@/features/setlists/hooks/useSetlistPlayback';
import { SetlistManageSheet } from '@/features/setlists/components/SetlistManageSheet';
import { SetlistPagerDock } from '@/features/setlists/components/SetlistPagerDock';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { useSongs } from '@/features/songs/hooks/useSongs';
import type { SetlistItem } from '@/features/setlists/types';
import { cn } from '@/shared/utils/cn';

const HINT_HOLD_COMMIT_MS = 900;

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
  const { canManageSetlists } = useAppRole();
  // Каталог нужен шиту «Добавить песню». Read-through + module-кэш: офлайн отдаёт
  // закешированный список, повторного запроса при переходах между песнями нет.
  const { songs } = useSongs();
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
    console.debug('[SongPage] swipe nav', { from: id, to: songId });
    ignoreNextScroll();
    if (contentRef.current) contentRef.current.scrollTop = 0;
    autoscroll.pause();
    playback.goTo(songId);
  };

  const pagerHint = usePagerHint();

  // Свайп между песнями сета: работает всюду, кроме 'paged' — там горизонталь занята
  // листанием страниц одной песни (§6 решения), и при открытой любой шторке страницы
  // (жест уже принадлежит ей).
  const swipeEnabled =
    playback.inSetlist && mode !== 'paged' && !isViewSettingsOpen && !isKeyPickerOpen && !isSetlistSheetOpen;

  const nextSongTitle = playback.nextId != null ? songs.find((s) => s.id === String(playback.nextId))?.title ?? '' : '';
  const prevSongTitle = playback.prevId != null ? songs.find((s) => s.id === String(playback.prevId))?.title ?? '' : '';

  const handleBack = () =>
    playback.inSetlist ? router.push('/dashboard/setlists') : router.push('/dashboard/songs');

  /**
   * Правка состава из шита. Если убрали ПРОСМАТРИВАЕМУЮ сейчас песню — экран остался бы
   * с песней вне сета (шапка сета исчезает, свайп мёртв), поэтому уходим на соседнюю,
   * а из опустевшего сета — в список сетов.
   */
  const handleItemsChange = (next: SetlistItem[]) => {
    const currentIndex = playback.index;
    playback.applyItems(next);
    if (next.some((item) => item.songId === Number(id))) return;
    if (next.length === 0) {
      router.push('/dashboard/setlists');
      return;
    }
    navigateToSetlistSong(next[Math.min(Math.max(currentIndex, 0), next.length - 1)].songId);
  };

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

        {/* Свайп между песнями сета — обёртка вокруг скролл-контейнера, не сам контейнер:
            SwipePager капчурит pointer-события и сдвигает контент трансформом во время
            жеста, а вертикальный скролл остаётся на внутреннем div (contentRef). */}
        <SwipePager
          enabled={swipeEnabled}
          canPrev={playback.prevId != null}
          canNext={playback.nextId != null}
          onPrev={() => {
            if (playback.prevId == null) return;
            navigateToSetlistSong(playback.prevId);
            pagerHint.showAndHide(playback.index - 1, prevSongTitle, false, HINT_HOLD_COMMIT_MS);
          }}
          onNext={() => {
            if (playback.nextId == null) return;
            navigateToSetlistSong(playback.nextId);
            pagerHint.showAndHide(playback.index + 1, nextSongTitle, false, HINT_HOLD_COMMIT_MS);
          }}
          // Во время жеста задаём только СОДЕРЖИМОЕ подсказки: показывает её прогресс
          // жеста. Отпустили, не дойдя до края, — прогресс гаснет вместе с возвратом
          // страницы, ничего больше не происходит.
          onDragChange={(state) => {
            if (!state.active) return;
            if (state.direction === 'next') pagerHint.track(playback.index + 1, nextSongTitle, state.atEdge);
            else if (state.direction === 'prev') pagerHint.track(playback.index - 1, prevSongTitle, state.atEdge);
          }}
          overlay={
            <PagerHint
              visible={pagerHint.state.visible}
              dragging={pagerHint.state.dragging}
              index={pagerHint.state.index}
              total={playback.total}
              label={pagerHint.state.label}
              atEdge={pagerHint.state.atEdge}
            />
          }
          className="relative min-h-0 flex-1 overflow-hidden"
        >
          {/* В постраничных режимах боковое поле целиком отдано корню песни
              (`px-4` в SongView): подложка листа тянется до края оболочки, а поле
              остаётся внутри листа — текст не впритык к его краю. */}
          <div
            ref={contentRef}
            className={cn('h-full min-h-0 overflow-y-auto', mode === 'scroll' ? 'px-4 py-4' : 'py-2')}
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
        </SwipePager>

        {/* Правый нижний край — единая точка входа для инструментов песни (сейчас
            автоскролл). Прячем при любой открытой нижней шторке — иначе перекрывает лист. */}
        {mode === 'scroll' && song && !isViewSettingsOpen && !isKeyPickerOpen && !isSetlistSheetOpen && (
          <SongToolStack hidden={headerHidden}>
            <SongAutoScroll
              playing={autoscroll.playing}
              step={autoscroll.step}
              canScroll={autoscroll.canScroll}
              onToggle={autoscroll.toggle}
              onSetStep={autoscroll.setStep}
            />
          </SongToolStack>
        )}

        {/* Нижняя таблетка навигации по сету — правый край отдан SongToolStack. */}
        {playback.inSetlist && mode !== 'paged' && (
          <SetlistPagerDock
            index={playback.index}
            total={playback.total}
            canPrev={playback.prevId != null}
            canNext={playback.nextId != null}
            onPrev={() => playback.prevId != null && navigateToSetlistSong(playback.prevId)}
            onNext={() => playback.nextId != null && navigateToSetlistSong(playback.nextId)}
            onOpenSetlist={() => setIsSetlistSheetOpen(true)}
            hidden={headerHidden}
          />
        )}
      </div>

      <SongViewSettings
        isOpen={isViewSettingsOpen}
        onClose={() => setIsViewSettingsOpen(false)}
        settings={viewSettings}
        onSettingsChange={setViewSettings}
      />

      {playback.inSetlist && setlistId && (
        <SetlistManageSheet
          isOpen={isSetlistSheetOpen}
          onClose={() => setIsSetlistSheetOpen(false)}
          setlistId={setlistId}
          title={playback.title}
          items={playback.items}
          onItemsChange={handleItemsChange}
          songs={songs}
          canManageSetlists={canManageSetlists}
          currentSongId={Number(id)}
          onOpenSong={(songId) => {
            setIsSetlistSheetOpen(false);
            navigateToSetlistSong(songId);
          }}
          onDeleted={() => router.replace('/dashboard/setlists')}
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
