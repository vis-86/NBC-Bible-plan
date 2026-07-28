'use client';

import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { FullScreenLoader } from '@/shared/components/ui/FullScreenLoader';

/**
 * Замена auth-guard из middleware.ts (снесённого в T6 — export несовместим с middleware).
 * `user` уже учитывает офлайн-фолбэк на last-known-user (AuthProvider) — гейт просто
 * доверяет ему, без собственной офлайн-ветки. `redirect` — pathname БЕЗ basePath
 * (usePathname() его не включает), ровно то, что ждёт /login (сам добавляет basePath).
 */
export default function DashboardAuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading || user) return;
    const search = searchParams.toString();
    const target = search ? `${pathname}?${search}` : pathname;
    router.replace(`/login?redirect=${encodeURIComponent(target)}`);
  }, [loading, user, pathname, searchParams, router]);

  // Гейт по `!user`, а НЕ по `loading || !user`: `refreshAuth()` (например после смены
  // имени в профиле) поднимает `loading` на уже залогиненном пользователе, и вариант
  // с `loading ||` размонтировал бы весь дашборд на время фоновой перепроверки —
  // вместе с состоянием экранов (подтверждение «Имя обновлено», фокус, открытые шторки).
  // Пока `user` известен, показываем контент; редирект по-прежнему ждёт `!loading`.
  if (!user) {
    return <FullScreenLoader label="Проверяем сессию…" />;
  }

  return <>{children}</>;
}
