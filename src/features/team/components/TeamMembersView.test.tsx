// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamMember } from '../types';

const api = vi.hoisted(() => ({
  listMembers: vi.fn(),
  createInvite: vi.fn(),
  createReset: vi.fn(),
  setRole: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../api', () => ({ teamApi: api }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { directus_id: 'aaaa-self' } }) }));

import { TeamMembersView } from './TeamMembersView';

const ME: TeamMember = { userId: 'aaaa-self', login: 'me', displayName: 'Я', role: 'team_admin', active: true };
const OTHER_ADMIN: TeamMember = { userId: 'cccc', login: 'adm', displayName: 'Админ', role: 'team_admin', active: true };
const BOB: TeamMember = { userId: 'bbbb', login: 'bob', displayName: 'Боб', role: 'reader', active: false };

function menuFor(userId: string) {
  const row = document.querySelector(`[data-team-member="${userId}"]`) as HTMLElement;
  fireEvent.click(row.querySelector('[data-action-menu-trigger]') as HTMLElement);
}
const item = (id: string) => document.querySelector(`[data-action-menu-item="${id}"]`) as HTMLElement | null;

async function renderLoaded() {
  render(<TeamMembersView />);
  await waitFor(() => expect(document.querySelector('[data-team-member]')).toBeTruthy());
}

describe('TeamMembersView', () => {
  beforeEach(() => {
    Object.values(api).forEach((m) => m.mockReset());
    api.listMembers.mockResolvedValue([ME, BOB]);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('показывает роли по-русски и помечает неактивных', async () => {
    await renderLoaded();
    const bob = document.querySelector('[data-team-member="bbbb"]') as HTMLElement;
    expect(bob.textContent).toContain('Участник');
    expect(bob.querySelector('[data-team-member-inactive]')).toBeTruthy();
    expect(document.querySelector('[data-team-member="aaaa-self"]')?.textContent).toContain('Администратор');
  });

  it('у себя и у другого администратора действий нет, у остальных есть', async () => {
    api.listMembers.mockResolvedValue([ME, OTHER_ADMIN, BOB]);
    await renderLoaded();
    const trigger = (id: string) =>
      document.querySelector(`[data-team-member="${id}"] [data-action-menu-trigger]`);
    expect(trigger('aaaa-self')).toBeNull();
    expect(trigger('cccc')).toBeNull();
    expect(trigger('bbbb')).toBeTruthy();

    menuFor('bbbb');
    expect(item('reset')).toBeTruthy();
    expect(item('role')).toBeTruthy();
    expect(item('remove')).toBeTruthy();
  });

  it('приглашение: роль уходит в запрос, ссылка показана, копирование работает', async () => {
    api.createInvite.mockResolvedValue({ url: 'https://app/activate?t=abc' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderLoaded();

    fireEvent.click(document.querySelector('[data-team-invite-button]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-team-role-option="musician"]') as HTMLElement);

    await waitFor(() => expect(document.querySelector('[data-team-link-url]')).toBeTruthy());
    expect(api.createInvite).toHaveBeenCalledWith('musician');
    expect((document.querySelector('[data-team-link-url]') as HTMLInputElement).value).toBe('https://app/activate?t=abc');
    expect(document.querySelector('[data-team-link-note]')?.textContent).toMatch(/одноразовая.*7 дней/);

    fireEvent.click(document.querySelector('[data-team-link-copy]') as HTMLElement);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app/activate?t=abc'));
  });

  it('ссылка для смены пароля запрашивается для выбранного участника', async () => {
    api.createReset.mockResolvedValue({ url: 'https://app/activate?t=reset' });
    await renderLoaded();
    menuFor('bbbb');
    fireEvent.click(item('reset') as HTMLElement);
    await waitFor(() => expect(document.querySelector('[data-team-link-url]')).toBeTruthy());
    expect(api.createReset).toHaveBeenCalledWith('bbbb');
  });

  it('в выборе роли нет «Администратор»', async () => {
    await renderLoaded();
    fireEvent.click(document.querySelector('[data-team-invite-button]') as HTMLElement);
    const options = [...document.querySelectorAll('[data-team-role-option]')].map((o) => o.textContent);
    expect(options).toEqual(['Участник', 'Музыкант', 'Редактор песен']);
    expect(document.querySelector('[data-team-role-option="team_admin"]')).toBeNull();
  });

  it('смена роли отправляет выбранную роль', async () => {
    api.setRole.mockResolvedValue({ success: true });
    await renderLoaded();
    menuFor('bbbb');
    fireEvent.click(item('role') as HTMLElement);
    fireEvent.click(document.querySelector('[data-team-role-option="musician_editor"]') as HTMLElement);
    await waitFor(() => expect(api.setRole).toHaveBeenCalledWith('bbbb', 'musician_editor'));
    await waitFor(() =>
      expect(document.querySelector('[data-team-member="bbbb"]')?.textContent).toContain('Редактор песен')
    );
  });

  it('удаление требует подтверждения', async () => {
    api.remove.mockResolvedValue({ success: true });
    await renderLoaded();
    menuFor('bbbb');
    fireEvent.click(item('remove') as HTMLElement);

    expect(screen.getByText(/вернуть может администратор приложения/)).toBeTruthy();
    expect(api.remove).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('[data-team-remove-confirm-button]') as HTMLElement);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('bbbb'));
    await waitFor(() => expect(document.querySelector('[data-team-member="bbbb"]')).toBeNull());
  });

  it('офлайн: сообщение, запрос не уходит', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<TeamMembersView />);
    await waitFor(() => expect(document.querySelector('[data-team-offline]')).toBeTruthy());
    expect(document.body.textContent).toContain('Управление командой доступно только с интернетом');
    expect(api.listMembers).not.toHaveBeenCalled();
  });
});
