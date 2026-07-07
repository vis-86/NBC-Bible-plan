'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { getApiPath, getBasePath } from '@/lib/utils';
import { SUPPORT_CONTACT } from '@/lib/constants';
import { isRegisterEnabled, isRegisterCodeRequired } from '@/shared/utils/constants';
import { InstallAppHint } from '@/shared/components/pwa/InstallAppHint';
import { Atmosphere } from '@/features/landing';

const inputClass =
  'mt-1 block w-full rounded-xl border border-app-border bg-app-surface-muted px-3.5 py-2.5 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Самостоятельная регистрация: login + displayName? + password (+ churchCode, если требуется).
 * Поле «Код церкви» показывается по build-time флагу isRegisterCodeRequired() и зеркалит
 * серверный isChurchCodeRequired(). Без authed-redirect (консистентно с /login). При выключенном
 * флаге регистрации — graceful-заглушка со ссылкой в поддержку (invite-fallback).
 * Серверный роут — источник истины (503 без секрета/флага, 403 при неверном коде).
 */
function RegisterForm() {
  const router = useRouter();
  const codeRequired = isRegisterCodeRequired();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [churchCode, setChurchCode] = useState('');
  const [error, setError] = useState('');
  const [confirmMismatch, setConfirmMismatch] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirmBlur = () => {
    setConfirmMismatch(confirm.length > 0 && password !== confirm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Пароль должен быть не менее ${PASSWORD_MIN_LENGTH} символов`);
      return;
    }
    if (password !== confirm) {
      setConfirmMismatch(true);
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
          churchCode: codeRequired ? churchCode.trim() : undefined,
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
    <Card below={<InstallAppHint />}>
      <div className="text-center">
        <h2 className="font-serif text-[clamp(26px,4vw,32px)] font-medium tracking-[-0.02em] text-app-text">
          Присоединяйтесь
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-app-text-secondary">
          {codeRequired
            ? 'Введите код церкви и придумайте логин — не используйте настоящие имя и телефон.'
            : 'Придумайте логин — не используйте настоящие имя и телефон.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-register-form>
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
          <label htmlFor="login" className="block text-sm font-medium text-app-text">Логин</label>
          <input
            id="login" type="text" required autoCapitalize="none" autoCorrect="off" autoComplete="username"
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
          <div className="relative mt-1">
            <input
              id="password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} mt-0 pr-11`} placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-app-text-muted hover:text-app-text"
            >
              {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-app-text-muted">Не менее {PASSWORD_MIN_LENGTH} символов</p>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-app-text">Повторите пароль</label>
          <div className="relative mt-1">
            <input
              id="confirm" type={showConfirm ? 'text' : 'password'} required autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (confirmMismatch) setConfirmMismatch(false);
              }}
              onBlur={handleConfirmBlur}
              className={`${inputClass} mt-0 pr-11`} placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Скрыть пароль' : 'Показать пароль'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-app-text-muted hover:text-app-text"
            >
              {showConfirm ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
            </button>
          </div>
          {confirmMismatch && (
            <p role="alert" className="mt-1.5 text-xs text-app-accent">Пароли не совпадают</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          data-register-form-submit
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-app-text px-6 py-3.5 text-[15px] font-semibold text-app-text-inverse transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Регистрация...' : 'Зарегистрироваться'}
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

      <div className="mt-5 text-center text-sm text-app-text-secondary">
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

        <div className="rounded-[32px] border border-app-border bg-app-surface/90 p-8 shadow-[0_8px_32px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-10">
          {children}
        </div>
        {below}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  // Флаг build-time: ветвление статично, Suspense не нужен (нет useSearchParams).
  return isRegisterEnabled() ? <RegisterForm /> : <RegisterDisabled />;
}
