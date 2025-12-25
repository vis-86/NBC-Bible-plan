'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { directus } from '@/lib/directus';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await directus.login({email, password});
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Ошибка входа. Проверьте данные.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white dark:bg-zinc-900 p-8 shadow-lg">
        <div>
          <h2 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Вход
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Войдите в свой аккаунт
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-black dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-black dark:text-zinc-50 placeholder-zinc-400 focus:border-black dark:focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-zinc-500"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-black dark:text-zinc-300"
            >
              Пароль
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-black dark:text-zinc-50 placeholder-zinc-400 focus:border-black dark:focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-zinc-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-black dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-black transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">
            Нет аккаунта?{' '}
          </span>
          <a
            href="/register"
            className="font-medium text-black dark:text-zinc-50 hover:underline"
          >
            Зарегистрироваться
          </a>
        </div>
      </div>
    </div>
  );
}

