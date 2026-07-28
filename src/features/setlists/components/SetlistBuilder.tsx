'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { SearchBar } from '@/shared/components/ui/SearchBar';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { useSongSearch } from '@/features/songs/hooks/useSongSearch';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useSetlistDraft } from '../hooks/useSetlistDraft';
import { useSaveSetlist } from '../hooks/useSaveSetlist';
import { nextSundayISO, defaultSetlistTitle } from '../lib/setlistDefaults';
import { formatDraftSavedAt } from '../lib/formatSetlistDate';
import { SetlistSongPickRow } from './SetlistSongPickRow';
import { SelectedChipsRow } from './SelectedChipsRow';
import { SetlistConfirmStep } from './SetlistConfirmStep';
import { SetlistReorderList, type ReorderableSong } from './SetlistReorderList';
import type { SongSummary } from '@/features/songs/types';

/** Планшет (≥768px) — Master-Detail: обе половины флоу видны сразу, без шагов. */
export const SETLIST_WIDE_LAYOUT_QUERY = '(min-width: 768px)';

interface SetlistBuilderProps {
  songs: SongSummary[];
}

/**
 * Создание сета в два шага: выбор песен → название/дата/порядок.
 * Редактирование существующего сета живёт не здесь, а прямо в `SetlistView`
 * (кнопка «Добавить песню» + drag-порядок на месте).
 */
export const SetlistBuilder: React.FC<SetlistBuilderProps> = ({ songs }) => {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isWideLayout = useMediaQuery(SETLIST_WIDE_LAYOUT_QUERY);
  // Запись сетов online-only (осознанное исключение из offline-first, см. docs/offline-pwa.md):
  // в обоих layout'ах «Сохранить» блокируется офлайн, чтобы не ронять запрос в таймаут.
  const isOnline = useIsOnline();
  const { draft, restoredAt, dismissRestored, toggleSong, removeSong, reorderSongs, setStep, setTitle, setDate, clear } =
    useSetlistDraft();
  const { create, submitting, error } = useSaveSetlist();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'selected'>('all');

  const results = useSongSearch(songs, query);
  const songById = useMemo(() => new Map(songs.map((s) => [Number(s.id), s])), [songs]);

  /**
   * Мемоизация обязательна: `Reorder` сопоставляет строки по идентичности объектов,
   * и новый массив новых объектов на каждый рендер молча ломает перетаскивание.
   */
  const selectedItems: ReorderableSong[] = useMemo(
    () =>
      draft.songIds
        .map((id) => songById.get(id))
        .filter((s): s is SongSummary => !!s)
        .map((s) => ({ id: Number(s.id), title: s.title })),
    [draft.songIds, songById]
  );

  const hasSelection = draft.songIds.length > 0;

  /** Список для показа: «Все» — результаты поиска, «Выбранные» — только выбранное, тем же запросом. */
  const visibleResults = useMemo(() => {
    if (filter === 'all') return results;
    return results.filter((song) => draft.songIds.includes(Number(song.id)));
  }, [filter, results, draft.songIds]);

  const handleCancel = () => {
    console.debug('[FIX] SetlistBuilder: выход из создания сета', { selected: draft.songIds.length });
    if (hasSelection) {
      const confirmed = window.confirm('Отменить создание сета? Выбранные песни будут потеряны.');
      if (!confirmed) return;
    }
    clear();
    router.push('/dashboard/setlists');
  };

  /**
   * В широком layout шага «Далее» нет, поэтому дефолты (название + ближайшее воскресенье)
   * проставляются один раз при входе — иначе поля пустые и «Сохранить» заблокирован.
   * Ref, а не зависимость от `draft`: иначе очищенное вручную название сразу возвращалось бы.
   */
  const wideDefaultsApplied = useRef(false);
  useEffect(() => {
    if (!isWideLayout || wideDefaultsApplied.current) return;
    wideDefaultsApplied.current = true;
    const sunday = draft.date ?? nextSundayISO();
    if (!draft.date) setDate(sunday);
    if (draft.title.trim().length === 0) setTitle(defaultSetlistTitle(sunday));
  }, [isWideLayout, draft.date, draft.title, setDate, setTitle]);

  /** Переход на шаг 2 заполняет пустые название/дату дефолтами (ближайшее воскресенье). */
  const handleNext = () => {
    if (!hasSelection) return;
    const sunday = draft.date ?? nextSundayISO();
    if (!draft.date) setDate(sunday);
    if (draft.title.trim().length === 0) setTitle(defaultSetlistTitle(sunday));
    setStep('confirm');
  };

  /**
   * Опустевший состав на шаге подтверждения — тупик: подтверждать нечего, а рендер
   * этого шага пропущен (условие ниже). Возвращаем на выбор песен, чтобы шаг не остался
   * в сохранённом черновике и не воспроизвёл тупик после перезагрузки.
   */
  useEffect(() => {
    if (draft.step !== 'confirm' || hasSelection) return;
    console.debug('[SetlistBuilder] состав опустел на шаге confirm — возврат на pick');
    setStep('pick');
  }, [draft.step, hasSelection, setStep]);

  /**
   * Сброс восстановленного черновика. Ref дефолтов тоже сбрасываем: `clear()` обнуляет
   * название и дату, и без этого широкий layout остался бы с пустыми полями и
   * заблокированным «Сохранить» — эффект ниже перезаполнит их дефолтами заново.
   */
  const handleStartOver = () => {
    clear();
    wideDefaultsApplied.current = false;
  };

  const handleSubmit = async () => {
    const id = await create({ title: draft.title.trim(), date: draft.date, songIds: draft.songIds });
    if (id === null) return; // Текст ошибки уже в `error`, черновик сохраняем для повтора.
    clear();
    router.replace(`/dashboard/setlist?id=${encodeURIComponent(id)}&created=1`);
  };

  /**
   * Черновик живёт до недели, поэтому подставлять прошлый состав молча нельзя —
   * плашка объясняет, откуда взялись песни, и даёт выход одним тапом.
   */
  const restoredBanner =
    restoredAt === null ? null : (
      <div
        role="status"
        data-setlist-builder-restored
        className="flex items-center gap-2 border-b border-app-border bg-app-surface-muted px-4 py-2 text-sm text-app-text-secondary"
      >
        <span className="min-w-0 flex-1 truncate">Восстановлен черновик от {formatDraftSavedAt(restoredAt)}</span>
        <button
          type="button"
          data-setlist-builder-restored-reset
          onClick={handleStartOver}
          className="shrink-0 rounded-app-sm px-2 py-1 font-medium text-app-primary transition-transform active:scale-95"
        >
          Начать заново
        </button>
        <button
          type="button"
          data-setlist-builder-restored-dismiss
          aria-label="Скрыть сообщение"
          onClick={dismissRestored}
          className="shrink-0 rounded-app-sm p-1 text-app-text-muted transition-transform active:scale-90"
        >
          <X size={16} />
        </button>
      </div>
    );

  const pickList = (
    <div role="listbox" aria-multiselectable="true" data-setlist-builder-pick-list className="flex flex-col gap-2">
      {visibleResults.length === 0 ? (
        <p className="py-8 text-center text-app-text-muted">
          {filter === 'selected' ? 'Ничего не выбрано по этому запросу' : 'Ничего не найдено'}
        </p>
      ) : (
        visibleResults.map((song, i) => {
          const songId = Number(song.id);
          const selected = draft.songIds.includes(songId);
          return (
            <motion.div
              key={song.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(i * 0.01, 0.2) }}
            >
              <SetlistSongPickRow song={song} selected={selected} onToggle={() => toggleSong(songId)} />
            </motion.div>
          );
        })
      )}
    </div>
  );

  // Планшет: обе половины видны сразу — шаги и фильтр «Выбранные» не нужны,
  // выбранное и так постоянно на экране в правой колонке.
  if (isWideLayout) {
    return (
      <div data-setlist-builder className="flex min-h-0 flex-1 flex-col">
        {/* Общая шапка «просмотра»: стрелка «назад» = отмена создания (с подтверждением). */}
        <PageHeader title="Новый сет" backAriaLabel="Отменить создание сета" onBack={handleCancel} />
        {restoredBanner}

        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex min-h-0 w-2/3 flex-col gap-3">
            <SearchBar onSearch={setQuery} placeholder="Поиск по песням" />
            <div className="min-h-0 flex-1 overflow-y-auto">{pickList}</div>
          </div>
          <div className="flex min-h-0 w-1/3 min-w-0 flex-col gap-4 overflow-y-auto border-l border-app-border pl-4">
            <div>
              <label
                htmlFor="setlist-title-input-desktop"
                className="mb-1.5 block text-sm font-medium text-app-text-secondary"
              >
                Название сета
              </label>
              <input
                id="setlist-title-input-desktop"
                data-setlist-builder-title-input
                type="text"
                maxLength={100}
                value={draft.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например, Воскресное утро"
                className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
              />
            </div>
            <div className="min-w-0">
              <label
                htmlFor="setlist-date-input-desktop"
                className="mb-1.5 block text-sm font-medium text-app-text-secondary"
              >
                Дата
              </label>
              {/* См. `SetlistConfirmStep`: `min-w-0 max-w-full appearance-none` — против
                  min-content ширины нативного календарного виджета в WebKit. */}
              <input
                id="setlist-date-input-desktop"
                data-setlist-builder-date-input
                type="date"
                value={draft.date ?? ''}
                onChange={(e) => setDate(e.target.value || null)}
                className="w-full min-w-0 max-w-full appearance-none rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
              />
            </div>

            <SetlistReorderList items={selectedItems} onReorder={reorderSongs} onRemove={removeSong} />

            {!isOnline && (
              <p role="alert" data-setlist-builder-offline-warning className="text-sm text-app-missed-text">
                Нужен интернет, чтобы сохранить сет.
              </p>
            )}

            {error && (
              <p role="alert" className="text-sm text-app-missed-text">
                {error}
              </p>
            )}

            <button
              type="button"
              data-setlist-builder-submit-desktop
              disabled={draft.title.trim().length === 0 || !hasSelection || submitting || !isOnline}
              onClick={handleSubmit}
              className="w-full rounded-app-md bg-app-primary px-4 py-2.5 text-sm font-semibold text-app-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (draft.step === 'confirm' && hasSelection) {
    return (
      <SetlistConfirmStep
        title={draft.title}
        date={draft.date}
        items={selectedItems}
        submitting={submitting}
        error={error}
        banner={restoredBanner}
        onTitleChange={setTitle}
        onDateChange={setDate}
        onReorder={reorderSongs}
        onRemove={removeSong}
        onBack={() => setStep('pick')}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div data-setlist-builder className="flex min-h-0 flex-1 flex-col">
      {/* Та же шапка, что в широком layout и на шаге подтверждения: только PageHeader
          резервирует бровь (`pt-safe-*`), поэтому на iPhone выход остаётся доступен. */}
      <PageHeader
        title="Новый сет"
        backAriaLabel="Отменить создание сета"
        onBack={handleCancel}
        right={
          <span aria-live="polite" data-setlist-builder-count className="text-sm text-app-text-secondary">
            Выбрано: {draft.songIds.length}
          </span>
        }
      />

      {restoredBanner}

      {/* Не sticky: скроллится только список ниже, а прежний `top-[57px]` был
          завязан на высоту рукописной шапки и с бровью давал перекрытие. */}
      <div className="space-y-2 bg-app-surface px-4 py-2">
        <SearchBar onSearch={setQuery} placeholder="Поиск по песням" />
        {/* На большом каталоге выбранное теряется из виду при скролле — этот
            переключатель сворачивает список до выбранного, не сбрасывая запрос. */}
        <div
          role="tablist"
          aria-label="Фильтр списка песен"
          data-setlist-builder-filter
          className="flex gap-1 rounded-app-md bg-app-surface-muted p-1"
        >
          {(['all', 'selected'] as const).map((value) => {
            const isActive = filter === value;
            const disabled = value === 'selected' && !hasSelection;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-setlist-builder-filter-option={value}
                disabled={disabled}
                onClick={() => setFilter(value)}
                className={`min-h-9 flex-1 rounded-app-sm px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  isActive ? 'bg-app-surface text-app-text shadow-app-sm' : 'text-app-text-secondary'
                }`}
              >
                {value === 'all' ? 'Все' : `Выбранные (${draft.songIds.length})`}
              </button>
            );
          })}
        </div>
      </div>

      <SelectedChipsRow
        items={selectedItems.map((s) => ({ songId: s.id, title: s.title }))}
        onRemove={removeSong}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-24">{pickList}</div>

      <div
        className="fixed inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-app-bg via-app-bg/90 to-transparent px-4 pb-4 pt-8"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          data-setlist-builder-next
          disabled={!hasSelection}
          aria-disabled={!hasSelection}
          onClick={handleNext}
          className="w-full max-w-sm rounded-full bg-app-primary px-6 py-3.5 text-base font-semibold text-app-text-inverse shadow-app-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Далее →
        </button>
      </div>
    </div>
  );
};

export default SetlistBuilder;
