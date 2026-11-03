// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import TelegramLinkForm from './TelegramLinkForm';
import { getLastKnownUser, setLastKnownUser } from '@/shared/offline/lastKnownUser';
import { __resetDBConnection } from '@/shared/offline/db';

describe('TelegramLinkForm', () => {
  beforeEach(() => {
    __resetDBConnection();
    vi.stubGlobal('location', { ...window.location, href: '', origin: 'http://localhost' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('после привязки снимает last-known-user другого пользователя', async () => {
    await setLastKnownUser({ directus_id: 'u-old', first_name: 'Старый' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { directus_id: 'u-new', first_name: 'Новый' } }),
      })
    );
    const { container } = render(<TelegramLinkForm initData="init" />);
    fireEvent.change(screen.getByPlaceholderText('ваш логин'), { target: { value: 'login' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password-1' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(async () => expect(await getLastKnownUser()).toBeUndefined());
  });
});
