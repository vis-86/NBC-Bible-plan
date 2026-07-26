'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useSetlist } from '@/features/setlists/hooks/useSetlist';
import { SetlistView } from '@/features/setlists/components/SetlistView';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { useSongs } from '@/features/songs/hooks/useSongs';

/** Тост «Сет создан» держится 3с — короче, чем стандартный Toast с Undo (тут отменять нечего). */
const CREATED_TOAST_MS = 3000;

function SetlistPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  // Флаг снимается из URL сразу же (см. эффект ниже), поэтому читаем его один раз при
  // монтировании: зависеть от searchParams нельзя — router.replace менял бы их и рвал
  // таймер автозакрытия (тост висел вечно).
  const [showCreatedToast, setShowCreatedToast] = useState(() => searchParams.get('created') === '1');

  const { setlist, loading, error } = useSetlist(id || null);
  const { canManageSetlists } = useAppRole();
  // Каталог нужен шиту «Добавить песню». Читается через read-through, поэтому офлайн
  // отдаёт закешированный список, а не пустоту.
  const { songs } = useSongs();

  useEffect(() => {
    if (!showCreatedToast) return;
    // Снимаем ?created=1 из URL, чтобы обновление/повторный визит не показывали тост снова.
    router.replace(`/dashboard/setlist?id=${encodeURIComponent(id)}`);
    const t = setTimeout(() => setShowCreatedToast(false), CREATED_TOAST_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только по флагу: id стабилен, а router/searchParams меняются этим же эффектом.
  }, [showCreatedToast]);

  return (
    <div data-setlist-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader variant="view" title={setlist?.title ?? 'Сет'} onBack={() => router.push('/dashboard/setlists')} />

      {showCreatedToast && (
        <div
          role="status"
          data-setlist-created-toast
          className="fixed bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-app-success py-2.5 pl-4 pr-2 text-sm font-medium text-app-text-inverse shadow-app-lg"
        >
          Сет создан
          <button
            type="button"
            data-setlist-created-toast-close
            aria-label="Закрыть уведомление"
            onClick={() => setShowCreatedToast(false)}
            className="rounded-app-sm p-1 transition-transform active:scale-90"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="px-4 pt-4">
            <ErrorMessage message={error} />
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-2 px-4 pt-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[60px] animate-pulse rounded-xl border border-app-border bg-app-surface-muted" />
            ))}
          </div>
        ) : setlist ? (
          <SetlistView setlist={setlist} canManageSetlists={canManageSetlists} songs={songs} />
        ) : (
          <div className="px-4 pt-4">
            <ErrorMessage message="Сет не найден" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SetlistPage() {
  return (
    <DashboardLayout onChangeView={() => {}}>
      {/* useSearchParams требует Suspense-границу в App Router. */}
      <Suspense fallback={null}>
        <SetlistPageContent />
      </Suspense>
    </DashboardLayout>
  );
}
