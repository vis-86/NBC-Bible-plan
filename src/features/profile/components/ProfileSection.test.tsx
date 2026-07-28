// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LOCAL_EMAIL_DOMAIN } from '@/lib/local-email';
import { ApiClientError } from '@/shared/services/api/client';

const { refreshAuthMock, updateProfileMock, authState, onlineState } = vi.hoisted(() => ({
  refreshAuthMock: vi.fn(),
  updateProfileMock: vi.fn(),
  authState: { user: null as unknown },
  onlineState: { value: true },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    logout: vi.fn(),
    refreshAuth: refreshAuthMock,
  }),
}));

vi.mock('@/shared/hooks/useIsOnline', () => ({
  useIsOnline: () => onlineState.value,
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  userApi: { updateProfile: updateProfileMock },
}));

import { ProfileSection } from './ProfileSection';

const USER = {
  directus_id: 'user-1',
  first_name: 'Игорь',
  username: `igor@${LOCAL_EMAIL_DOMAIN}`,
};

function edit() {
  return screen.getByRole('button', { name: 'Изменить имя' });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = { ...USER };
  onlineState.value = true;
  updateProfileMock.mockResolvedValue({ success: true, user: { directus_id: 'user-1', first_name: 'x' } });
  refreshAuthMock.mockResolvedValue(undefined);
});

describe('ProfileSection — режим просмотра', () => {
  it('логин отрисован текстом, а не полем ввода', () => {
    const { container } = render(<ProfileSection />);
    const loginRow = container.querySelector('[data-profile-section-login]');
    expect(loginRow).toBeTruthy();
    expect(loginRow?.querySelector('input')).toBeNull();
    // Во всей секции просмотра инпутов нет вовсе — ни редактируемых, ни disabled.
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('логин показан без синтетического домена', () => {
    const { container } = render(<ProfileSection />);
    const loginRow = container.querySelector('[data-profile-section-login]');
    expect(loginRow?.textContent).toContain('igor');
    expect(loginRow?.textContent).not.toContain(LOCAL_EMAIL_DOMAIN);
  });

  it('не рендерит строку логина для не-синтетического email', () => {
    authState.user = { ...USER, username: 'ivan@gmail.com' };
    const { container } = render(<ProfileSection />);
    expect(container.querySelector('[data-profile-section-login]')).toBeNull();
    expect(screen.getByText('Игорь')).toBeTruthy();
  });

  it('карандаш имеет доступное имя', () => {
    render(<ProfileSection />);
    expect(edit()).toBeTruthy();
  });
});

describe('ProfileSection — переход в режим правки', () => {
  it('тап по карандашу открывает поле с label и ставит в него фокус', async () => {
    render(<ProfileSection />);
    fireEvent.click(edit());

    const input = screen.getByLabelText('Отображаемое имя') as HTMLInputElement;
    expect(input.value).toBe('Игорь');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('«Отмена» отбрасывает правку и возвращает фокус на карандаш', async () => {
    const { container } = render(<ProfileSection />);
    fireEvent.click(edit());

    const input = screen.getByLabelText('Отображаемое имя');
    fireEvent.change(input, { target: { value: 'Другое имя' } });
    fireEvent.click(container.querySelector('[data-profile-section-cancel]') as HTMLElement);

    expect(screen.queryByLabelText('Отображаемое имя')).toBeNull();
    expect(screen.getByText('Игорь')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(edit()));
  });

  it('«Сохранить» заблокирована, пока имя не изменено', () => {
    const { container } = render(<ProfileSection />);
    fireEvent.click(edit());
    const save = container.querySelector('[data-profile-section-save]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'Игорь В.' } });
    expect(save.disabled).toBe(false);
  });

  it('пустое имя на blur даёт понятную ошибку', () => {
    render(<ProfileSection />);
    fireEvent.click(edit());
    const input = screen.getByLabelText('Отображаемое имя');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    expect(screen.getByRole('alert').textContent).toContain('не может быть пустым');
  });
});

describe('ProfileSection — офлайн', () => {
  it('карандаш заблокирован и показана подсказка про интернет', () => {
    onlineState.value = false;
    render(<ProfileSection />);

    expect((edit() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Нужен интернет/)).toBeTruthy();
  });
});

describe('ProfileSection — сохранение', () => {
  it('успех: вызван updateProfile и refreshAuth, вернулись в просмотр', async () => {
    const { container } = render(<ProfileSection />);
    fireEvent.click(edit());
    fireEvent.change(screen.getByLabelText('Отображаемое имя'), {
      target: { value: '  Игорь Васильев  ' },
    });
    fireEvent.click(container.querySelector('[data-profile-section-save]') as HTMLElement);

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith('Игорь Васильев'));
    await waitFor(() => expect(refreshAuthMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByLabelText('Отображаемое имя')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Имя обновлено');
    // Фокус возвращается на карандаш и после сохранения, не только после «Отмены».
    await waitFor(() => expect(document.activeElement).toBe(edit()));
  });

  it('ошибка сервера: остаёмся в правке, refreshAuth не вызван', async () => {
    updateProfileMock.mockRejectedValueOnce(new ApiClientError('Имя не может быть пустым', 400));
    const { container } = render(<ProfileSection />);
    fireEvent.click(edit());
    fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'Новое' } });
    fireEvent.click(container.querySelector('[data-profile-section-save]') as HTMLElement);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Имя не может быть пустым'));
    expect(screen.getByRole('alert').textContent).toContain('Попробуйте ещё раз');
    expect(refreshAuthMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Отображаемое имя')).toBeTruthy();
  });
});
