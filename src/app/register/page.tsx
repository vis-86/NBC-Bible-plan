'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { directus } from '@/lib/directus';
import { registerUser } from '@directus/sdk';

const inputClass =
  'mt-1 block w-full rounded-md border border-app-border bg-app-surface-muted px-3 py-2 text-app-text placeholder-app-text-subtle focus:border-app-primary/50 focus:outline-none focus:ring-1 focus:ring-app-primary/30';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (password.length < 8) {
      setError('Пароль должен быть не менее 8 символов');
      return;
    }

    setLoading(true);

    try {
      await directus.request(registerUser(email, password));
      await directus.login({ email, password }, { mode: 'json', provider: 'local', otp: '' });
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(
        err?.message || 'Ошибка регистрации. Возможно, такой email уже существует.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-app-surface p-8 shadow-app-md">
        <div>
          <h2 className="text-2xl font-semibold text-app-text">
            Регистрация
          </h2>
          <p className="mt-2 text-sm text-app-text-secondary">
            Создайте новый аккаунт
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
              placeholder="Минимум 8 символов"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-app-text">
              Подтвердите пароль
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-app-text text-app-text-inverse px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-app-text-secondary">
            Уже есть аккаунт?{' '}
          </span>
          <Link
            href="/login"
            className="font-medium text-app-text hover:underline"
          >
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}
