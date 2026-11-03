'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasTelegramWebAppObject, isTelegramWebApp, initTelegramWebApp, getTelegramInitData } from '@/lib/telegram';
import { getApiPath, getBasePath } from '@/lib/utils';
import { getStartPath } from '@/shared/config/appMode';
import { forgetForeignLastKnownUser } from '@/shared/offline/offlineOwner';
import { SUPPORT_CONTACT } from '@/lib/constants';
import { isRegisterEnabled } from '@/shared/utils/constants';
import TelegramLinkForm from '@/features/auth/components/TelegramLinkForm';
import { InstallAppHint } from '@/shared/components/pwa/InstallAppHint';
import { getAppBrand, isWorshipMode } from '@/shared/config/appMode';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // Неверные логин/пароль у новичка часто значат «аккаунта ещё нет» — подсказываем путь.
  const [badCredentials, setBadCredentials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(true);
  const [telegramVerificationFailed, setTelegramVerificationFailed] = useState(false);
  // initData для формы привязки, когда tg_id ещё не связан с аккаунтом.
  const [tgLinkInitData, setTgLinkInitData] = useState<string | null>(null);

  const worship = isWorshipMode();

  useEffect(() => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const checkTelegram = async () => {
      // Витрина worship: вход через Telegram не поддерживается — только логин/пароль.
      if (worship || !hasTelegramWebAppObject()) {
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

        const data = await verifyRes.json().catch(() => ({}));

        // ВАЖНО: ветвимся по data.linked, НЕ по verifyRes.ok — иначе при linked:false
        // редирект на /dashboard → middleware вернёт на /login → бесконечный цикл.
        if (verifyRes.ok && data.linked) {
          await forgetForeignLastKnownUser(data.user?.directus_id);
          const redirect = searchParams.get('redirect') || '/dashboard';
          const url = redirect.startsWith('http') ? redirect : `${window.location.origin}${getBasePath()}${redirect}`;
          window.location.href = url;
          return;
        }

        if (verifyRes.ok && data.linked === false) {
          // tg_id не привязан — показываем форму однократной привязки.
          setTgLinkInitData(initData);
          setTelegramLoading(false);
          return;
        }
      } catch (err) {
        console.error('Error verifying Telegram user:', err);
      }
      setTelegramVerificationFailed(true);
      setTelegramLoading(false);
    };

    checkTelegram();
  }, [router, searchParams, worship]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBadCredentials(false);
    setLoading(true);

    try {
      const res = await fetch(getApiPath('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login: login.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Ошибка входа. Проверьте данные.');
        setBadCredentials(res.status === 401);
        return;
      }

      // Прежний last-known-user снимаем сразу, до любых других запросов: cookie уже новая.
      await forgetForeignLastKnownUser(data?.user?.directus_id);

      // Полная навигация: cookie сессии точно применена, а перезагрузка страницы после
      // смены владельца данных (AuthProvider) не перебивает клиентский переход.
      const redirect = searchParams.get('redirect') || getStartPath();
      window.location.replace(
        redirect.startsWith('http') ? redirect : `${window.location.origin}${getBasePath()}${redirect}`
      );
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

  // tg_id ещё не привязан — показываем форму однократной привязки аккаунта.
  if (tgLinkInitData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <TelegramLinkForm initData={tgLinkInitData} />
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
      <div className="w-full max-w-md">
      <button
        type="button"
        onClick={() => router.push('/')}
        className="mx-auto mb-6 flex items-center justify-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${getBasePath()}/icons/icon-192.png`}
          alt=""
          aria-hidden
          width={40}
          height={40}
          className="h-10 w-10 rounded-xl shadow-[0_6px_18px_rgba(79,70,229,0.25)]"
        />
        <span className="text-[15px] font-semibold tracking-tight text-app-text">
          {worship ? getAppBrand().name : 'План чтения Библии'}
        </span>
      </button>
      <div className="space-y-8 rounded-lg bg-app-surface p-8 shadow-app-md">
        <div>
          <h2 className="text-2xl font-semibold text-app-text">
            Вход
          </h2>
          <p className="mt-2 text-sm text-app-text-secondary">
            {worship ? 'Логин и пароль из вашего приглашения' : 'Логин и пароль — те, что вы придумали при регистрации'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div role="alert" className="rounded-md bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent">
              {error}
              {badCredentials && !worship && isRegisterEnabled() && (
                <p className="mt-1 text-app-text-secondary">
                  Ещё не регистрировались? Создайте аккаунт кнопкой ниже.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="login" className="block text-sm font-medium text-app-text">
              Логин
            </label>
            <input
              id="login"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className={inputClass}
              autoComplete="username"
              placeholder="ваш логин"
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
              autoComplete="current-password"
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

        {/* Новичок, открывший установленное приложение, попадает сюда (start_url → гейт →
            /login), поэтому путь «нет аккаунта» — отдельная заметная кнопка, а не ссылка. */}
        {!worship && (
        <div className="border-t border-app-border pt-6 text-center" data-login-new-user>
          <p className="text-sm font-medium text-app-text">Впервые здесь?</p>
          {isRegisterEnabled() ? (
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="mt-3 w-full rounded-md border border-app-border-strong bg-app-surface px-4 py-2 text-sm font-semibold text-app-text transition-colors hover:bg-app-surface-muted"
              data-login-new-user-register-btn
            >
              Создать аккаунт
            </button>
          ) : (
            <a
              href={SUPPORT_CONTACT}
              className="mt-3 block w-full rounded-md border border-app-border-strong bg-app-surface px-4 py-2 text-sm font-semibold text-app-text transition-colors hover:bg-app-surface-muted"
            >
              Получить приглашение
            </a>
          )}
          <p className="mt-2 text-xs text-app-text-muted">
            {isRegisterEnabled() ? 'Займёт минуту, почта и телефон не нужны' : 'Аккаунты выдаём по личной ссылке через поддержку'}
          </p>
        </div>
        )}

        <p className="text-center text-sm text-app-text-secondary">
          {worship ? (
            'Забыли пароль или логин? Обратитесь к руководителю команды.'
          ) : (
            <>
              Забыли пароль или логин?{' '}
              <a href={SUPPORT_CONTACT} className="font-medium text-app-text hover:underline">
                Напишите в поддержку
              </a>
            </>
          )}
        </p>
      </div>
      <InstallAppHint />
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
