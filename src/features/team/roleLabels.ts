import type { AppRole } from '@/lib/app-roles';

export const ROLE_LABELS: Record<AppRole, string> = {
  reader: 'Участник',
  musician: 'Музыкант',
  musician_editor: 'Редактор песен',
  team_admin: 'Администратор',
};

/** Роли, которые администратор команды выдаёт сам; `team_admin` выдаёт администратор приложения. */
export const ROLE_ORDER: AppRole[] = ['reader', 'musician', 'musician_editor'];
