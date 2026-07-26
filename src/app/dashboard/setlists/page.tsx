'use client';

import { useRouter } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSetlists } from '@/features/setlists/hooks/useSetlists';
import { SetlistsList } from '@/features/setlists/components/SetlistsList';
import { useAppRole } from '@/shared/hooks/useAppRole';

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function SetlistsPageContent() {
  const router = useRouter();
  const { setlists, loading, error } = useSetlists();
  const { canManageSetlists } = useAppRole();

  return (
    <div data-setlists-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        variant="page"
        title="Сетлисты"
        right={
          canManageSetlists && setlists.length > 0 ? (
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {error ? (
          <ErrorMessage message={error} />
        ) : loading && setlists.length === 0 ? (
          <ul data-setlists-loading className="flex flex-col gap-2" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-[72px] animate-pulse rounded-xl border border-app-border bg-app-surface-muted" />
            ))}
          </ul>
        ) : (
          <SetlistsList setlists={setlists} todayISO={todayISO()} canManageSetlists={canManageSetlists} />
        )}
      </div>
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
