// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppRole } from '@/lib/app-roles';

const state = vi.hoisted(() => ({ role: 'reader' as AppRole, team: null as { id: string; name: string } | null }));
vi.mock('@/shared/hooks/useAppRole', () => ({ useAppRole: () => ({ role: state.role }) }));
vi.mock('../hooks/useTeamInfo', () => ({ useTeamInfo: () => state.team }));

import { TeamSettingsSection } from './TeamSettingsSection';

describe('TeamSettingsSection', () => {
  it('ссылка на управление только у team_admin; название показано', () => {
    state.team = { id: 't1', name: 'Команда А' };
    state.role = 'team_admin';
    const admin = render(<TeamSettingsSection />);
    expect(admin.container.querySelector('[data-team-settings-name]')?.textContent).toBe('Команда А');
    expect(admin.container.querySelector('[data-team-settings-manage-link]')?.getAttribute('href')).toBe(
      '/dashboard/team'
    );
    admin.unmount();

    state.role = 'musician_editor';
    const member = render(<TeamSettingsSection />);
    expect(member.container.querySelector('[data-team-settings-name]')).toBeTruthy();
    expect(member.container.querySelector('[data-team-settings-manage-link]')).toBeNull();
  });

  it('без названия (офлайн без кеша) у не-администратора секции нет', () => {
    state.team = null;
    state.role = 'reader';
    const { container } = render(<TeamSettingsSection />);
    expect(container.querySelector('[data-team-settings-section]')).toBeNull();
  });
});
