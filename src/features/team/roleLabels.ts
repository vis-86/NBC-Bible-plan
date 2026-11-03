import type { AppRole } from '@/lib/app-roles';

export const ROLE_LABELS: Record<AppRole, string> = {
  reader: 'Участник',
  musician: 'Музыкант',
  musician_editor: 'Редактор песен',
  team_admin: 'Администратор',
};

export const ROLE_ORDER: AppRole[] = ['reader', 'musician', 'musician_editor', 'team_admin'];
