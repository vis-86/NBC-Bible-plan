'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getApiPath, getBasePath } from '@/lib/utils';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

// Контакт поддержки для проблем с активацией/входом.
const SUPPORT_CONTACT = 'https://t.me/nbc_support';

function ActivateForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const isReset = searchParams.get('mode') === 'reset';

  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Card>
        <p className="text-app-text-secondary">
          Ссылка некорректна. Обратитесь в поддержку:{' '}
          <a href={SUPPORT_CONTACT} className="font-medium text-app-text hover:underline">поддержка</a>.
        </p>
      </Card>
    );
  }

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
      const res = await fetch(getApiPath('/api/auth/activate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          isReset ? { token, password } : { token, login: login.trim(), displayName: displayName.trim(), password }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Не удалось завершить. Попробуйте ещё раз.');
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
        <h2 className="text-2xl font-semibold text-app-text">
          {isReset ? 'Новый пароль' : 'Создание аккаунта'}
        </h2>
        {!isReset && (
          <p className="mt-2 text-sm text-app-text-secondary">
            Придумайте логин и имя — не используйте настоящие имя и телефон.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent">
            {error}
          </div>
        )}

        {!isReset && (
          <>
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
          </>
        )}

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
          {loading ? 'Сохранение...' : isReset ? 'Сохранить пароль' : 'Создать аккаунт'}
        </button>
      </form>
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

export default function ActivatePage() {
  return (
    <Suspense fallback={<Card><div className="text-app-text-muted">Загрузка...</div></Card>}>
      <ActivateForm />
    </Suspense>
  );
}
