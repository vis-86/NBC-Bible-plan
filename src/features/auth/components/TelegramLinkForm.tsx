'use client';

import { useState } from 'react';
import { getApiPath, getBasePath } from '@/lib/utils';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

interface TelegramLinkFormProps {
  /** initData из Telegram WebApp для верификации на сервере. */
  initData: string;
}

/**
 * Однократная привязка Telegram-аккаунта к существующему пароль-аккаунту.
 * После успеха mini-app входит без логина/пароля.
 */
export default function TelegramLinkForm({ initData }: TelegramLinkFormProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(getApiPath('/api/auth/telegram/link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ initData, login: login.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Не удалось привязать аккаунт.');
        return;
      }
      window.location.href = `${window.location.origin}${getBasePath()}/dashboard`;
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-8 rounded-lg bg-app-surface p-8 shadow-app-md">
      <div>
        <h2 className="text-2xl font-semibold text-app-text">Привязка аккаунта</h2>
        <p className="mt-2 text-sm text-app-text-secondary">
          Войдите один раз логином и паролем — дальше Telegram будет открывать приложение
          без ввода данных.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="tg-login" className="block text-sm font-medium text-app-text">Логин</label>
          <input
            id="tg-login" type="text" required autoCapitalize="none" autoCorrect="off"
            value={login} onChange={(e) => setLogin(e.target.value)}
            className={inputClass} placeholder="ваш логин"
          />
        </div>
        <div>
          <label htmlFor="tg-password" className="block text-sm font-medium text-app-text">Пароль</label>
          <input
            id="tg-password" type="password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={inputClass} placeholder="••••••••"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-app-text text-app-text-inverse px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Привязка...' : 'Привязать и войти'}
        </button>
      </form>
    </div>
  );
}
