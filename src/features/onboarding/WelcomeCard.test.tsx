// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeCard } from './WelcomeCard';
import {
  WELCOME_PENDING_KEY,
  markWelcomePending,
  resetWelcomeSessionForTests,
  useWelcome,
} from './welcomeStore';

function Harness() {
  const [show, dismiss] = useWelcome();
  return show ? <WelcomeCard userName="Иван" onDismiss={dismiss} /> : <p>нет приветствия</p>;
}

beforeEach(() => {
  window.localStorage.clear();
  resetWelcomeSessionForTests();
});

describe('WelcomeCard + welcomeStore', () => {
  it('без флага регистрации приветствия нет (давние пользователи)', () => {
    render(<Harness />);
    expect(screen.getByText('нет приветствия')).toBeInTheDocument();
  });

  it('после регистрации показывается с именем и тремя подсказками', () => {
    markWelcomePending();
    render(<Harness />);

    expect(screen.getByRole('heading', { name: 'Добро пожаловать, Иван!' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('«Понятно» прячет карточку и стирает флаг навсегда', () => {
    markWelcomePending();
    const { unmount } = render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Понятно' }));
    expect(screen.getByText('нет приветствия')).toBeInTheDocument();
    expect(window.localStorage.getItem(WELCOME_PENDING_KEY)).toBeNull();

    unmount();
    render(<Harness />);
    expect(screen.getByText('нет приветствия')).toBeInTheDocument();
  });

  it('крестик тоже закрывает', () => {
    markWelcomePending();
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть приветствие' }));
    expect(screen.getByText('нет приветствия')).toBeInTheDocument();
  });

  it('без имени — нейтральный заголовок', () => {
    render(<WelcomeCard onDismiss={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Добро пожаловать!' })).toBeInTheDocument();
  });
});
