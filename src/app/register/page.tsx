'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiPath, getBasePath } from '@/lib/utils';
import { SUPPORT_CONTACT } from '@/lib/constants';
import { isRegisterEnabled } from '@/shared/utils/constants';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

/**
 * Самостоятельная регистрация по коду церкви: login + displayName? + password + churchCode.
 * Без authed-redirect (консистентно с /login). При выключенном флаге — graceful-заглушка
 * со ссылкой в поддержку (invite-fallback). Серверный роут — источник истины (503 без секрета).
 */
function RegisterForm() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [churchCode, setChurchCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(getApiPath('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          login: login.trim(),
          displayName: displayName.trim() || undefined,
          password,
          churchCode: churchCode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Не удалось зарегистрироваться. Попробуйте ещё раз.');
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
    <Card>
      <div>
        <h2 className="text-2xl font-semibold text-app-text">Регистрация</h2>
        <p className="mt-2 text-sm text-app-text-secondary">
          Введите код церкви и придумайте логин — не используйте настоящие имя и телефон.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="churchCode" className="block text-sm font-medium text-app-text">Код церкви</label>
          <input
            id="churchCode" type="text" required autoCapitalize="none" autoCorrect="off"
            value={churchCode} onChange={(e) => setChurchCode(e.target.value)}
            className={inputClass} placeholder="код с собрания"
          />
        </div>

        <div>
          <label htmlFor="login" className="block text-sm font-medium text-app-text">Логин</label>
          <input
            id="login" type="text" required autoCapitalize="none" autoCorrect="off"
            value={login} onChange={(e) => setLogin(e.target.value)}
            className={inputClass} placeholder="например, brother_ivan"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-app-text">Отображаемое имя</label>
          <input
            id="displayName" type="text"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass} placeholder="как показывать в приложении"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-app-text">Пароль</label>
          <input
            id="password" type="password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            className={inputClass} placeholder="••••••••"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-app-text">Повторите пароль</label>
          <input
            id="confirm" type="password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className={inputClass} placeholder="••••••••"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-app-text text-app-text-inverse px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>
      </form>

      <div className="text-center text-sm text-app-text-secondary">
        Уже есть аккаунт?{' '}
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="font-medium text-app-text hover:underline"
        >
          Войти
        </button>
      </div>
    </Card>
  );
}

/** Заглушка при выключенной регистрации — направляем в поддержку (invite-модель). */
function RegisterDisabled() {
  return (
    <Card>
      <div>
        <h2 className="text-2xl font-semibold text-app-text">Регистрация недоступна</h2>
      </div>
      <p className="text-sm text-app-text-secondary">
        Сейчас аккаунты выдаём по личной ссылке-приглашению. Напишите в поддержку —
        пришлём ссылку:{' '}
        <a href={SUPPORT_CONTACT} className="font-medium text-app-text hover:underline">поддержка</a>.
      </p>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-app-surface p-8 shadow-app-md">
        {children}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  // Флаг build-time: ветвление статично, Suspense не нужен (нет useSearchParams).
  return isRegisterEnabled() ? <RegisterForm /> : <RegisterDisabled />;
}
