// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppRole } from '@/lib/app-roles';

const state = vi.hoisted(() => ({ role: 'reader' as AppRole, loading: false }));
vi.mock('@/shared/hooks/useAppRole', () => ({ useAppRole: () => state }));
vi.mock('@/shared/components/layout/PageHeader', () => ({ PageHeader: () => null }));
vi.mock('./TeamMembersView', () => ({ TeamMembersView: () => <div data-members-view /> }));

import { TeamScreen } from './TeamScreen';

describe('TeamScreen', () => {
  it('не-администратор видит «Нет доступа» и список не монтируется', () => {
    state.role = 'musician_editor';
    const { container } = render(<TeamScreen />);
    expect(container.querySelector('[data-team-forbidden]')?.textContent).toBe('Нет доступа');
    expect(container.querySelector('[data-members-view]')).toBeNull();
  });

  it('team_admin видит список участников', () => {
    state.role = 'team_admin';
    const { container } = render(<TeamScreen />);
    expect(container.querySelector('[data-members-view]')).toBeTruthy();
  });
});
