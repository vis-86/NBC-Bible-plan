'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { hasTelegramWebAppObject, isTelegramWebApp, initTelegramWebApp, getTelegramInitData } from '@/lib/telegram';
import { getApiPath, getBasePath } from '@/lib/utils';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramVerificationFailed, setTelegramVerificationFailed] = useState(false);

  useEffect(() => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const checkTelegram = async () => {
      if (!hasTelegramWebAppObject()) {
        setTelegramLoading(false);
        return;
      }

      initTelegramWebApp();
      let initData = getTelegramInitData();
      if (!initData) {
        for (let i = 0; i < 3; i++) {
          await delay(350);
          initData = getTelegramInitData();
          if (initData) break;
        }
      }
      if (!initData) {
        setTelegramLoading(false);
        return;
      }

      try {
        const verifyRes = await fetch(getApiPath('/api/auth/telegram'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ initData }),
        });

        if (verifyRes.ok) {
          const redirect = searchParams.get('redirect') || '/dashboard';
          const url = redirect.startsWith('http') ? redirect : `${window.location.origin}${getBasePath()}${redirect}`;
          window.location.href = url;
          return;
        }
      } catch (err) {
        console.error('Error verifying Telegram user:', err);
      }
      setTelegramVerificationFailed(true);
      setTelegramLoading(false);
    };

    checkTelegram();
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(getApiPath('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Ошибка входа. Проверьте данные.');
        return;
      }

      const redirect = searchParams.get('redirect') || '/dashboard';

      // Убеждаемся, что cookie сессии применена: проверяем сессию перед редиректом,
      // чтобы запросы дашборда уже шли с cookie (избегаем 401 при быстрой навигации).
      const sessionRes = await fetch(getApiPath('/api/auth/session'), {
        credentials: 'include',
      });
      const sessionData = await sessionRes.json().catch(() => ({}));
      if (sessionData?.user) {
        if (typeof (window as any).refreshAuth === 'function') {
          (window as any).refreshAuth();
        }
        router.push(redirect);
        router.refresh();
      } else {
        // cookie не подхватилась — редирект полной загрузкой страницы, чтобы cookie точно применилась
        window.location.href = redirect.startsWith('http') ? redirect : `${window.location.origin}${getBasePath()}${redirect}`;
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка входа. Проверьте данные.');
    } finally {
      setLoading(false);
    }
  };

  if (telegramLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <div className="text-app-text-muted">Проверка аутентификации...</div>
      </div>
    );
  }

  // В Telegram при неуспешной верификации — только сообщение; не из Telegram — всегда форма входа
  if (isTelegramWebApp() && telegramVerificationFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <div className="w-full max-w-md rounded-lg bg-app-surface p-8 shadow-app-md text-center">
          <p className="text-app-text-secondary">
            Откройте приложение из Telegram, чтобы войти. Если вы уже в Telegram — попробуйте закрыть и открыть мини-приложение снова.
          </p>
        </div>
      </div>
    );
  }

  // Не из Telegram или успешная верификация в Telegram (редирект уже выполнен) — показываем форму входа
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-app-surface p-8 shadow-app-md">
        <div>
          <h2 className="text-2xl font-semibold text-app-text">
            Вход
          </h2>
          <p className="mt-2 text-sm text-app-text-secondary">
            Войдите в свой аккаунт
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-app-text">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-app-text">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-app-text text-app-text-inverse px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-app-text-secondary">
            Нет аккаунта?{' '}
          </span>
          <Link
            href="/register"
            className="font-medium text-app-text hover:underline"
          >
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <div className="text-app-text-muted">Загрузка...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
