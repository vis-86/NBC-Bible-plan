'use client';

import type { AppRole } from '@/lib/app-roles';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { cn } from '@/shared/utils/cn';
import { ROLE_LABELS, ROLE_ORDER } from '../roleLabels';

export interface TeamRolePickerProps {
  isOpen: boolean;
  title: string;
  /** Текущая роль — подсвечивается (при смене роли участника). */
  current?: AppRole;
  onPick: (role: AppRole) => void;
  onClose: () => void;
}

export function TeamRolePicker({ isOpen, title, current, onPick, onClose }: TeamRolePickerProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <ul data-team-role-picker className="space-y-2 px-4 pb-6">
        {ROLE_ORDER.map((role) => (
          <li key={role}>
            <button
              type="button"
              data-team-role-option={role}
              onClick={() => onPick(role)}
              className={cn(
                'flex min-h-11 w-full items-center justify-between rounded-app-md border-2 px-4 py-3 text-left',
                current === role
                  ? 'border-app-primary bg-app-primary-light font-medium text-app-primary'
                  : 'border-app-border text-app-text-secondary'
              )}
            >
              <span>{ROLE_LABELS[role]}</span>
              {current === role && <span aria-hidden>✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
