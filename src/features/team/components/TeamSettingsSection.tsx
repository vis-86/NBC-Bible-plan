'use client';

import Link from 'next/link';
import { canManageTeam } from '@/lib/app-roles';
import { useAppRole } from '@/shared/hooks/useAppRole';
import { useTeamInfo } from '../hooks/useTeamInfo';

export interface TeamSettingsSectionProps {
  className?: string;
}

/** Секция «Команда» в настройках: название и (для администратора) вход в управление. */
export function TeamSettingsSection({ className }: TeamSettingsSectionProps) {
  const team = useTeamInfo();
  const { role } = useAppRole();
  const admin = canManageTeam(role);

  if (!team && !admin) return null;

  return (
    <section data-team-settings-section className={className ?? 'mt-8 space-y-3'}>
      <h2 className="text-sm font-medium text-app-text-secondary">Команда</h2>
      {team && (
        <p data-team-settings-name className="text-app-text">
          {team.name}
        </p>
      )}
      {admin && (
        <Link
          href="/dashboard/team"
          data-team-settings-manage-link
          className="flex min-h-11 items-center rounded-app-md border-2 border-app-border px-4 py-3 text-app-text-secondary"
        >
          Управление командой
        </Link>
      )}
    </section>
  );
}
