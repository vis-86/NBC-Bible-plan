'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getApiPath } from '@/lib/utils';
import { isTelegramWebApp, initTelegramWebApp } from '@/lib/telegram';
import { getLastKnownUser, setLastKnownUser, clearLastKnownUser } from '@/shared/offline/lastKnownUser';
import { raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import { scheduleEnsureOfflineData } from '@/shared/offline/autoDownload';

interface User {
  directus_id: string;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  // Telegram Mini App: expand to full height and apply header color from theme
  useEffect(() => {
    if (isTelegramWebApp()) {
      initTelegramWebApp();
    }
  }, []);

  const checkSession = async () => {
    // Обязательно true и на повторных вызовах (refreshAuth() после логина) — иначе
    // DashboardAuthGate видит стухшее `user === null` от предыдущей проверки и
    // редиректит на /login раньше, чем этот checkSession успевает отработать
    // (router.push после логина не ждёт refreshAuth() — гонка).
    setLoading(true);
    try {
      // Race с таймаутом: реальный «офлайн» (сеть есть, интернета нет) вешает fetch на
      // минуты, а не роняет его — без таймаута authLoading никогда не снимался и
      // пользователь навсегда оставался на FullScreenLoader вместо офлайн-входа.
      const sessionFetch = fetch(getApiPath('/api/auth/session'), {
        credentials: 'include',
      });
      sessionFetch.catch(() => {}); // поздний reject после ухода в фолбэк — не unhandled

      let response: Response;
      try {
        response = await raceNetwork(sessionFetch, DEFAULT_NETWORK_TIMEOUT_MS);
      } catch (err) {
        if (isNetworkTimeout(err)) {
          const lastKnownUser = await getLastKnownUser<User>();
          if (lastKnownUser) {
            console.debug('[FIX][AuthProvider] session check timed out — falling back to last-known-user');
            setUser(lastKnownUser);
            return;
          }
          // Фолбэка нет — дожидаемся медленную сеть (лучше, чем выкинуть на логин).
          response = await sessionFetch;
        } else {
          throw err;
        }
      }

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          void setLastKnownUser(data.user);
          // Только server-confirmed вход (не last-known-user фолбэк ниже) — иначе
          // офлайн-вход пытается качать данные без сети.
          scheduleEnsureOfflineData();
        } else {
          // Сервер явно ответил «сессии нет» — это НЕ повод для офлайн-фолбэка.
          setUser(null);
        }
      } else {
        // response.ok === false — тоже реальное «сессии нет» (напр. 401), а не сетевая ошибка.
        setUser(null);
      }
    } catch (error) {
      // fetch() упал (сеть недоступна) — единственный случай, где уместен офлайн-вход
      // по последнему подтверждённому пользователю.
      console.error('Error checking session:', error);
      const lastKnownUser = await getLastKnownUser<User>();
      if (lastKnownUser) {
        console.debug('[AuthProvider] offline — falling back to last-known-user');
        setUser(lastKnownUser);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Экспортируем checkSession для использования в других компонентах
  useEffect(() => {
    // Создаем глобальную функцию для обновления сессии (для использования после Telegram верификации)
    (window as any).refreshAuth = checkSession;
    
    return () => {
      delete (window as any).refreshAuth;
    };
  }, []);

  // При 401 (истёк токен) API-клиент вызывает этот callback — выходим и редирект на логин
  useEffect(() => {
    (globalThis as unknown as { __onSessionExpired?: () => void }).__onSessionExpired = () => {
      setUser(null);
      void clearLastKnownUser();
      router.push('/login');
      fetch(getApiPath('/api/auth/logout'), { method: 'POST', credentials: 'include' }).catch(() => {});
    };
    return () => {
      delete (globalThis as unknown as { __onSessionExpired?: () => void }).__onSessionExpired;
    };
  }, [router]);

  const logout = async () => {
    try {
      await fetch(getApiPath('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      await clearLastKnownUser();
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

