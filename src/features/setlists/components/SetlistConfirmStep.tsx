'use client';

import { X } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { SetlistReorderList, type ReorderableSong } from './SetlistReorderList';

interface SetlistConfirmStepProps {
  title: string;
  date: string | null;
  /** Мемоизированный список выбранных песен в порядке черновика (см. `SetlistReorderList`). */
  items: ReorderableSong[];
  submitting: boolean;
  error: string | null;
  /**
   * Плашка восстановленного черновика билдера. Шаг `confirm` рендерится вместо всего
   * билдера, поэтому без явного проброса восстановленный черновик открывался бы без
   * «Начать заново» — и создать новый сет было бы нечем.
   */
  banner?: React.ReactNode;
  onTitleChange: (title: string) => void;
  onDateChange: (date: string | null) => void;
  onReorder: (songIds: number[]) => void;
  onRemove: (songId: number) => void;
  onBack: () => void;
  /** Выход из билдера целиком (с подтверждением) — второй выход помимо «назад к выбору». */
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * Шаг 2 билдера: название, дата и порядок песен. Полноэкранный, а не BottomSheet —
 * в шите нет вертикального места под drag-список, а порядок задаётся именно здесь.
 */
export const SetlistConfirmStep: React.FC<SetlistConfirmStepProps> = ({
  title,
  date,
  items,
  submitting,
  error,
  banner,
  onTitleChange,
  onDateChange,
  onReorder,
  onRemove,
  onBack,
  onCancel,
  onSubmit,
}) => {
  const isOnline = useIsOnline();
  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && trimmedTitle.length <= 100 && items.length > 0 && isOnline && !submitting;

  return (
    <div data-setlist-confirm-step className="flex min-h-0 flex-1 flex-col">
      {/* Общая шапка: только она резервирует бровь (`pt-safe-*`). Своя вёрстка шапки
          на iPhone уезжала под статус-бар — кнопки выхода были недоступны. */}
      <PageHeader
        title="Новый сет"
        backAriaLabel="Назад к выбору песен"
        onBack={onBack}
        right={
          // «Назад» ведёт только на шаг выбора; без отдельного выхода восстановленный
          // черновик со `step='confirm'` был бы тупиком.
          <button
            type="button"
            data-setlist-confirm-cancel
            aria-label="Отменить создание сета"
            onClick={onCancel}
            className="rounded-app-sm p-2 text-app-text-secondary transition-transform active:scale-90"
          >
            <X size={20} />
          </button>
        }
      />

      {banner}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-28">
        <div>
          <label htmlFor="setlist-title-input" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
            Название сета
          </label>
          <input
            id="setlist-title-input"
            data-setlist-builder-title-input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Например, Воскресное утро"
            className="w-full rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
          />
        </div>

        <div className="min-w-0">
          <label htmlFor="setlist-date-input" className="mb-1.5 block text-sm font-medium text-app-text-secondary">
            Дата
          </label>
          {/* WebKit не сжимает `input[type=date]` до контейнера по одному `w-full`:
              нативный календарный виджет задаёт min-content ширину. */}
          <input
            id="setlist-date-input"
            data-setlist-builder-date-input
            type="date"
            value={date ?? ''}
            onChange={(e) => onDateChange(e.target.value || null)}
            className="w-full min-w-0 max-w-full appearance-none rounded-app-md border border-app-border bg-app-surface px-3 py-2.5 text-app-text outline-none transition-colors focus:border-app-primary"
          />
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium text-app-text-secondary">
            Порядок ({items.length})
          </h2>
          <SetlistReorderList items={items} onReorder={onReorder} onRemove={onRemove} />
        </div>

        {!isOnline && (
          <p role="alert" data-setlist-builder-offline-warning className="text-sm text-app-missed-text">
            Нужен интернет, чтобы сохранить сет.
          </p>
        )}

        {error && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-app-missed-text">
              {error}
            </p>
            <button
              type="button"
              data-setlist-builder-retry
              onClick={onSubmit}
              className="w-full rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary"
            >
              Повторить
            </button>
          </div>
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-app-bg via-app-bg/90 to-transparent px-4 pb-4 pt-8"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          data-setlist-builder-submit
          disabled={!canSubmit}
          onClick={onSubmit}
          className="w-full max-w-sm rounded-full bg-app-primary px-6 py-3.5 text-base font-semibold text-app-text-inverse shadow-app-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
};

export default SetlistConfirmStep;
