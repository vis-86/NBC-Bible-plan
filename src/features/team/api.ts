import type { AppRole } from '@/lib/app-roles';
import { apiClient } from '@/shared/services/api/client';
import type { TeamInfo, TeamMember } from './types';

/** Клиент `/api/team`. Управление участниками — online-only, в IDB ничего не кладётся. */
export const teamApi = {
  getTeam: () => apiClient.get<TeamInfo>('/api/team'),
  listMembers: () => apiClient.get<TeamMember[]>('/api/team/members'),
  createInvite: (role: AppRole) => apiClient.post<{ url: string }>('/api/team/invites', { role }),
  createReset: (userId: string) =>
    apiClient.post<{ url: string }>(`/api/team/members/${encodeURIComponent(userId)}/reset`),
  setRole: (userId: string, role: AppRole) =>
    apiClient.patch<{ success: true }>(`/api/team/members/${encodeURIComponent(userId)}`, { role }),
  remove: (userId: string) =>
    apiClient.delete<{ success: true }>(`/api/team/members/${encodeURIComponent(userId)}`),
};
