'use client';

import { useState } from 'react';
import type { AppRole } from '@/lib/app-roles';
import { ActionMenu, type ActionMenuItem } from '@/shared/components/ui/ActionMenu';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { useTeamMembers } from '../hooks/useTeamMembers';
import { ROLE_LABELS } from '../roleLabels';
import type { TeamMember } from '../types';
import { TeamLinkSheet } from './TeamLinkSheet';
import { TeamRolePicker } from './TeamRolePicker';

type Dialog =
  | { kind: 'invite' }
  | { kind: 'role'; member: TeamMember }
  | { kind: 'remove'; member: TeamMember }
  | null;

function memberName(m: TeamMember): string {
  return m.displayName || m.login || 'Без имени';
}

/** Список участников и действия администратора. Монтируется только для `team_admin`. */
export function TeamMembersView() {
  const team = useTeamMembers();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [link, setLink] = useState<{ url: string; title: string } | null>(null);

  if (team.status === 'offline') {
    return (
      <p data-team-offline className="p-6 text-center text-app-text-muted">
        Управление командой доступно только с интернетом
      </p>
    );
  }
  if (team.status === 'forbidden') {
    return <p data-team-forbidden className="p-6 text-center text-app-text-muted">Нет доступа</p>;
  }
  if (team.status === 'error') {
    return <ErrorMessage message="Не удалось загрузить участников" onRetry={() => void team.reload()} />;
  }

  const invite = async (role: AppRole) => {
    setDialog(null);
    const url = await team.createInvite(role);
    if (url) setLink({ url, title: 'Ссылка-приглашение' });
  };

  const reset = async (m: TeamMember) => {
    const url = await team.createReset(m.userId);
    if (url) setLink({ url, title: 'Ссылка для смены пароля' });
  };

  const pickRole = async (m: TeamMember, role: AppRole) => {
    setDialog(null);
    if (role !== m.role) await team.changeRole(m.userId, role);
  };

  const confirmRemove = async (m: TeamMember) => {
    setDialog(null);
    await team.removeMember(m.userId);
  };

  const menuItems = (m: TeamMember): ActionMenuItem[] => {
    // У себя и у другого администратора действий нет: сервер ответил бы 409.
    if (m.role === 'team_admin' || m.userId.toLowerCase() === team.selfId) return [];
    return [
      { id: 'reset', label: 'Ссылка для смены пароля', onSelect: () => void reset(m) },
      { id: 'role', label: 'Изменить роль', onSelect: () => setDialog({ kind: 'role', member: m }) },
      { id: 'remove', label: 'Убрать из команды', destructive: true, onSelect: () => setDialog({ kind: 'remove', member: m }) },
    ];
  };

  const removing = dialog?.kind === 'remove' ? dialog.member : null;

  return (
    <div data-team-members className="px-4 pt-3 pb-nav">
      <Button type="button" data-team-invite-button onClick={() => setDialog({ kind: 'invite' })} className="mb-3 w-full">
        Пригласить
      </Button>

      {team.actionError && (
        <p data-team-action-error role="alert" className="mb-2 text-sm text-app-missed-text">
          {team.actionError}
        </p>
      )}

      {team.status === 'loading' ? (
        <p data-team-loading className="p-6 text-center text-app-text-muted">Загрузка…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {team.members.map((m) => (
            <li
              key={m.userId}
              data-team-member={m.userId}
              className="flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-app-text">{memberName(m)}</p>
                <p className="truncate text-sm text-app-text-muted">
                  {m.login ?? '—'} · <span data-team-member-role>{ROLE_LABELS[m.role]}</span>
                  {!m.active && <span data-team-member-inactive> · не активирован</span>}
                </p>
              </div>
              {menuItems(m).length > 0 && (
                <ActionMenu items={menuItems(m)} ariaLabel={`Действия с участником ${memberName(m)}`} />
              )}
            </li>
          ))}
        </ul>
      )}

      <TeamRolePicker
        isOpen={dialog?.kind === 'invite'}
        title="Роль приглашённого"
        onPick={(role) => void invite(role)}
        onClose={() => setDialog(null)}
      />
      <TeamRolePicker
        isOpen={dialog?.kind === 'role'}
        title="Изменить роль"
        current={dialog?.kind === 'role' ? dialog.member.role : undefined}
        onPick={(role) => dialog?.kind === 'role' && void pickRole(dialog.member, role)}
        onClose={() => setDialog(null)}
      />
      <BottomSheet isOpen={removing !== null} onClose={() => setDialog(null)} title="Убрать из команды?">
        <div data-team-remove-confirm className="space-y-3 px-4 pb-6">
          <p className="text-sm text-app-text-secondary">
            Участник больше не сможет войти; вернуть может администратор приложения.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setDialog(null)} className="flex-1">
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              data-team-remove-confirm-button
              onClick={() => removing && void confirmRemove(removing)}
              className="flex-1"
            >
              Убрать
            </Button>
          </div>
        </div>
      </BottomSheet>
      <TeamLinkSheet url={link?.url ?? null} title={link?.title ?? ''} onClose={() => setLink(null)} />
    </div>
  );
}
