'use client';

import { useRouter } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { useSongs } from '@/features/songs/hooks/useSongs';
import { SetlistBuilder } from '@/features/setlists/components/SetlistBuilder';

function AccessDenied() {
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-app-text-secondary">Недостаточно прав для управления сетлистами.</p>
      <button
        type="button"
        onClick={() => router.push('/dashboard/songs')}
        className="rounded-app-md border-2 border-app-primary px-4 py-2.5 text-sm font-medium text-app-primary"
      >
        Назад
      </button>
    </div>
  );
}

/**
 * Только СОЗДАНИЕ сета. Правка существующего живёт в `SetlistView` (`/dashboard/setlist?id=`):
 * там же добавление песни, удаление и drag-порядок. Путь маршрута не меняем — он в
 * `APP_SHELL_ROUTES` и в прекеше SW у уже установленных PWA.
 */
function SetlistEditPageContent() {
  const { canManageSetlists, loading: roleLoading } = useAppRole();
  const { songs } = useSongs();

  return (
    <div data-setlist-edit-page className="flex min-h-0 flex-1 flex-col">
      {roleLoading ? null : canManageSetlists ? <SetlistBuilder songs={songs} /> : <AccessDenied />}
    </div>
  );
}

export default function SetlistEditPage() {
  return (
    <DashboardLayout onChangeView={() => {}} hideBottomNav>
      <SetlistEditPageContent />
    </DashboardLayout>
  );
}
