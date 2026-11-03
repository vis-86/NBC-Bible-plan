import type { AppRole } from '@/lib/app-roles';

/** Форма ответа `GET /api/team`. Серверные типы живут в `services/` и в клиент не импортируются. */
export interface TeamInfo {
  id: string;
  name: string;
}

/** Форма элемента `GET /api/team/members`. */
export interface TeamMember {
  userId: string;
  login: string | null;
  displayName: string | null;
  role: AppRole;
  active: boolean;
}
