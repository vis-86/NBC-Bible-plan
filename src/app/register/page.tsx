'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { getApiPath, getBasePath } from '@/lib/utils';
import { forgetForeignLastKnownUser } from '@/shared/offline/offlineOwner';
import { SUPPORT_CONTACT } from '@/lib/constants';
import { isRegisterEnabled, isRegisterCodeRequired } from '@/shared/utils/constants';
import { InstallAppHint } from '@/shared/components/pwa/InstallAppHint';
import { Atmosphere } from '@/features/landing';
import { LOGIN_HANDLE_HINT, loginHandleError } from '@/lib/validators/login-handle';
import { getTelegramInitData, isTelegramWebApp } from '@/lib/telegram';
import { markWelcomePending } from '@/features/onboarding/welcomeStore';
import { isWorshipMode } from '@/shared/config/appMode';

const inputClass =
  'mt-1 block w-full rounded-xl border border-app-border bg-app-surface-muted px-3.5 py-2.5 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Самостоятельная регистрация: displayName? + login + password (+ churchCode, если требуется).
 * Поле «Код церкви» показывается по build-time флагу isRegisterCodeRequired() и зеркалит
 * серверный isChurchCodeRequired(). Без authed-redirect (консистентно с /login). При выключенном
 * флаге регистрации — graceful-заглушка со ссылкой в поддержку (invite-fallback).
 * Серверный роут — источник истины (503 без секрета/флага, 403 при неверном коде).
 *
 * Повтора пароля нет сознательно: вместо него — кнопка «показать» и экран «Аккаунт создан»,
 * где пароль можно открыть и проверить. Почты нет, поэтому этот экран — единственный
 * момент напомнить, что восстановление только через поддержку.
 */
function RegisterForm() {
  const router = useRouter();
  const codeRequired = isRegisterCodeRequired();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [churchCode, setChurchCode] = useState('');
  const [error, setError] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedLogin = login.trim();
    const handleError = loginHandleError(trimmedLogin);
    if (handleError) {
      setLoginError(handleError);
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Пароль должен быть не менее ${PASSWORD_MIN_LENGTH} символов`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(getApiPath('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          login: trimmedLogin,
          displayName: displayName.trim() || undefined,
          password,
          churchCode: codeRequired ? churchCode.trim() : undefined,
          // Из mini-app сервер сразу привяжет Telegram — без повторного входа в форме привязки.
          telegramInitData: isTelegramWebApp() ? getTelegramInitData() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error || 'Не удалось создать аккаунт. Попробуйте ещё раз.';
        // Занятый логин — ошибка конкретного поля, показываем рядом с ним.
        if (res.status === 409) setLoginError(message);
        else setError(message);
        return;
      }
      await forgetForeignLastKnownUser(data?.user?.directus_id);
      markWelcomePending();
      setCreated({ login: trimmedLogin, password });
    } catch {
      setError('Ошибка сети. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  if (created) return <RegisterSuccess login={created.login} password={created.password} />;

  return (
    <Card below={<InstallAppHint />}>
      <div className="text-center">
        <h2 className="font-serif text-[clamp(26px,4vw,32px)] font-medium tracking-[-0.02em] text-app-text">
          Создайте аккаунт
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-app-text-secondary">
          {codeRequired
            ? 'Займёт минуту. Понадобится код церкви — почта и телефон не нужны.'
            : 'Займёт минуту. Почта и телефон не нужны.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-register-form noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-xl bg-app-missed border border-app-missed-text/20 p-3 text-sm text-app-accent"
          >
            {error}
          </div>
        )}

        {codeRequired && (
          <div>
            <label htmlFor="churchCode" className="block text-sm font-medium text-app-text">Код церкви</label>
            <input
              id="churchCode" type="text" required autoCapitalize="none" autoCorrect="off"
              value={churchCode} onChange={(e) => setChurchCode(e.target.value)}
              className={inputClass} placeholder="код с собрания"
            />
          </div>
        )}

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-app-text">
            Как к вам обращаться <span className="font-normal text-app-text-muted">— необязательно</span>
          </label>
          <input
            id="displayName" type="text" autoComplete="nickname"
            value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass} placeholder="например, Иван"
          />
        </div>

        <div>
          <label htmlFor="login" className="block text-sm font-medium text-app-text">Логин</label>
          <input
            id="login" type="text" required autoCapitalize="none" autoCorrect="off" spellCheck={false}
            autoComplete="username" inputMode="email"
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              // Ошибку снимаем, как только ввод стал валидным, — не ругаемся на каждой букве.
              if (loginError && !loginHandleError(e.target.value.trim())) setLoginError(null);
            }}
            onBlur={() => setLoginError(login.trim() ? loginHandleError(login.trim()) : null)}
            aria-invalid={loginError ? true : undefined}
            aria-describedby="login-hint"
            className={inputClass} placeholder="например, brother_ivan"
          />
          {loginError ? (
            <p id="login-hint" role="alert" className="mt-1.5 text-xs text-app-accent" data-register-form-login-error>
              {loginError}
            </p>
          ) : (
            <p id="login-hint" className="mt-1.5 text-xs text-app-text-muted">
              {LOGIN_HANDLE_HINT}. Его вы будете вводить при входе.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-app-text">Пароль</label>
          <div className="relative mt-1">
            <input
              id="password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-hint"
              className={`${inputClass} mt-0 pr-11`} placeholder="••••••••"
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </div>
          <p id="password-hint" className="mt-1.5 text-xs text-app-text-muted">
            Не менее {PASSWORD_MIN_LENGTH} символов. Нажмите на глаз, чтобы проверить, что набрали.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-register-form-submit
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-app-text px-6 py-3.5 text-[15px] font-semibold text-app-text-inverse transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Создаём аккаунт...' : 'Создать аккаунт'}
          {!loading && (
            <ArrowRight
              size={18}
              className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          )}
        </button>
      </form>

      <p className="mx-auto mt-5 flex items-center justify-center gap-2 text-sm text-app-text-muted">
        <ShieldCheck size={16} strokeWidth={2.2} className="shrink-0 text-app-success" />
        Не нужны имя и телефон — только логин
      </p>

      <div className="mt-6 border-t border-app-border pt-5 text-center text-sm text-app-text-secondary">
        Уже есть аккаунт?{' '}
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="font-semibold text-app-text underline-offset-2 hover:underline"
        >
          Войти
        </button>
      </div>
    </Card>
  );
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'}
      className="absolute inset-y-0 right-0 flex items-center px-3 text-app-text-muted hover:text-app-text"
    >
      {shown ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
    </button>
  );
}

/**
 * Экран после создания аккаунта. Сессия уже выставлена сервером — здесь только напоминание
 * о логине/пароле (почты нет → забытый пароль = письмо в поддержку) и вход в приложение.
 */
function RegisterSuccess({ login, password }: { login: string; password: string }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card below={<InstallAppHint />}>
      <div className="text-center" data-register-success>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-app-success-light text-app-success">
          <CheckCircle2 size={28} strokeWidth={2.2} />
        </div>
        <h2 className="mt-5 font-serif text-[clamp(26px,4vw,32px)] font-medium tracking-[-0.02em] text-app-text">
          Аккаунт создан
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-app-text-secondary">
          Запомните логин и пароль — они понадобятся на новом телефоне или после выхода.
          Почты у аккаунта нет, поэтому восстановить доступ можно только через поддержку.
        </p>
      </div>

      <dl className="mt-7 space-y-3 rounded-2xl border border-app-border bg-app-surface-muted p-4 text-left">
        <div>
          <dt className="text-xs font-medium text-app-text-muted">Логин</dt>
          <dd className="mt-0.5 break-all font-mono text-[15px] text-app-text" data-register-success-login>{login}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-app-text-muted">Пароль</dt>
          <dd className="relative mt-0.5 pr-11">
            <span className="break-all font-mono text-[15px] text-app-text">
              {showPassword ? password : '•'.repeat(password.length)}
            </span>
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => {
          window.location.href = `${window.location.origin}${getBasePath()}/dashboard`;
        }}
        data-register-success-continue
        className="group mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-app-text px-6 py-3.5 text-[15px] font-semibold text-app-text-inverse transition-all hover:opacity-90 active:scale-[0.98]"
      >
        Начать читать
        <ArrowRight
          size={18}
          className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        />
      </button>
    </Card>
  );
}

/** Заглушка при выключенной регистрации — направляем в поддержку (invite-модель). */
function RegisterDisabled() {
  return (
    <Card>
      <div className="text-center">
        <h2 className="font-serif text-[clamp(26px,4vw,32px)] font-medium tracking-[-0.02em] text-app-text">
          Регистрация недоступна
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-app-text-secondary">
          Сейчас аккаунты выдаём по личной ссылке-приглашению. Напишите в поддержку —
          пришлём ссылку:{' '}
          <a href={SUPPORT_CONTACT} className="font-medium text-app-text hover:underline">поддержка</a>.
        </p>
      </div>
    </Card>
  );
}

function Card({ children, below }: { children: React.ReactNode; below?: React.ReactNode }) {
  const router = useRouter();
  const basePath = getBasePath();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-app-bg px-4 py-10">
      <Atmosphere />
      <div className="relative z-[2] w-full max-w-md">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mx-auto mb-6 flex items-center justify-center gap-3"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${basePath}/icons/icon-192.png`}
            alt=""
            aria-hidden
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl shadow-[0_6px_18px_rgba(79,70,229,0.25)]"
          />
          <span className="text-[15px] font-semibold tracking-tight text-app-text">План чтения Библии</span>
        </button>

        <div className="rounded-[32px] border border-app-border bg-app-surface p-8 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)] sm:p-10">
          {children}
        </div>
        {below}
      </div>
    </div>
  );
}

/** Витрина worship: вход только по инвайту — регистрации нет. */
function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}

export default function RegisterPage() {
  if (isWorshipMode()) return <RegisterRedirect />;
  // Флаг build-time: ветвление статично, Suspense не нужен (нет useSearchParams).
  return isRegisterEnabled() ? <RegisterForm /> : <RegisterDisabled />;
}
