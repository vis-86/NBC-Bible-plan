'use client';

import { canManageTeam } from '@/lib/app-roles';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { TeamMembersView } from './TeamMembersView';

/** Экран «Команда»: не-администратору (в т.ч. по прямому URL) — «Нет доступа», запросов нет. */
export function TeamScreen() {
  const { role, loading } = useAppRole();

  return (
    <div data-team-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader variant="page" title="Команда" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-app-bg">
        {loading ? (
          <p className="p-6 text-center text-app-text-muted">Загрузка…</p>
        ) : canManageTeam(role) ? (
          <TeamMembersView />
        ) : (
          <p data-team-forbidden className="p-6 text-center text-app-text-muted">Нет доступа</p>
        )}
      </div>
    </div>
  );
}
