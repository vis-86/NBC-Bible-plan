'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { PullToRefresh } from '@/shared/components/ui/PullToRefresh';
import { useSetlists } from '@/features/setlists/hooks/useSetlists';
import { SetlistsList } from '@/features/setlists/components/SetlistsList';
import { SetlistManageHost } from '@/features/setlists/components/SetlistManageHost';
import { useAppRole } from '@/shared/hooks/useAppRole';
import type { SetlistSummary, SetlistSummaryItem } from '@/features/setlists/types';

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function SetlistsPageContent() {
  const router = useRouter();
  const { setlists, loading, error, refresh, refreshError } = useSetlists();
  const { canManageSetlists } = useAppRole();

  /**
   * Локальная копия списка: правки из шита применяются оптимистично. Module-кэш
   * `useSetlists` инвалидируется внутри мутаций (`resetSetlistsCache`), но текущий
   * рендер он не обновляет — без копии карточка показывала бы старый состав.
   */
  const [localSetlists, setLocalSetlists] = useState<SetlistSummary[]>(setlists);
  /** Выбранный для правки сет + с чего открыть шит. `null` — шит (и каталог песен) не смонтирован. */
  const [managed, setManaged] = useState<{ setlist: SetlistSummary; action: 'edit' | 'delete' } | null>(null);

  useEffect(() => {
    const syncFromServer = () => setLocalSetlists(setlists);
    syncFromServer();
  }, [setlists]);

  const handleItemsChange = useCallback((setlistId: string, items: SetlistSummaryItem[]) => {
    setLocalSetlists((prev) => prev.map((s) => (s.id === setlistId ? { ...s, items } : s)));
  }, []);

  const handlePullToRefresh = useCallback(() => {
    console.debug('[SetlistsPage] pull-to-refresh → refresh()');
    return refresh();
  }, [refresh]);

  const handleDeleted = useCallback((setlistId: string) => {
    console.warn(`[SetlistsPage] сет ${setlistId} удалён — убираем из списка`);
    setLocalSetlists((prev) => prev.filter((s) => s.id !== setlistId));
    setManaged(null);
  }, []);

  return (
    <div data-setlists-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        variant="page"
        title="Сетлисты"
        right={
          canManageSetlists && localSetlists.length > 0 ? (
            <button
              type="button"
              data-setlists-create-button-header
              onClick={() => router.push('/dashboard/setlist-edit')}
              className="rounded-app-md border-2 border-app-primary px-3 py-1.5 text-sm font-medium text-app-primary transition-transform active:scale-95"
            >
              Создать
            </button>
          ) : undefined
        }
      />

      <PullToRefresh
        onRefresh={handlePullToRefresh}
        className="px-4 pt-3 pb-6"
      >
        {/* Данные на экране валидны — неудачное обновление не подменяет список ошибкой. */}
        {refreshError && (
          <p data-setlists-refresh-error className="pb-2 text-center text-sm text-app-text-muted">
            {refreshError}
          </p>
        )}
        {error ? (
          <ErrorMessage message={error} />
        ) : loading && localSetlists.length === 0 ? (
          <ul data-setlists-loading className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-xl border border-app-border bg-app-surface-muted" />
            ))}
          </ul>
        ) : (
          <SetlistsList
            setlists={localSetlists}
            todayISO={todayISO()}
            canManageSetlists={canManageSetlists}
            onEdit={canManageSetlists ? (setlist) => setManaged({ setlist, action: 'edit' }) : undefined}
            onDelete={canManageSetlists ? (setlist) => setManaged({ setlist, action: 'delete' }) : undefined}
          />
        )}
      </PullToRefresh>

      {/* Каталог песен грузится лениво — хост монтируется только под выбранный сет. */}
      {managed && (
        <SetlistManageHost
          key={`${managed.setlist.id}:${managed.action}`}
          setlist={managed.setlist}
          initialAction={managed.action}
          canManageSetlists={canManageSetlists}
          onClose={() => setManaged(null)}
          onItemsChange={handleItemsChange}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

export default function SetlistsPage() {
  return (
    <DashboardLayout onChangeView={() => {}}>
      <SetlistsPageContent />
    </DashboardLayout>
  );
}
