'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getApiPath } from '@/lib/utils';
import { isTelegramWebApp, initTelegramWebApp } from '@/lib/telegram';
import { getLastKnownUser, setLastKnownUser, clearLastKnownUser } from '@/shared/offline/lastKnownUser';
import { raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import { scheduleEnsureOfflineData } from '@/shared/offline/autoDownload';
import { ensureOfflineOwner } from '@/shared/offline/offlineOwner';

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
  /**
   * Перечитать сессию с сервера. Нужен после мутаций профиля: обновляет и контекст,
   * и офлайн-копию (`setLastKnownUser` внутри `checkSession`) одним вызовом.
   * Типизированная замена глобальному `window.refreshAuth`.
   */
  refreshAuth: () => Promise<void>;
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
    console.debug('[AuthProvider] session check requested');

    // Оптимистичный старт: последний подтверждённый пользователь подставляется сразу,
    // не дожидаясь сети, — экран (песня по ссылке `/s`, план) открывается мгновенно,
    // а не после round-trip'а сессии. Источник истины по-прежнему сервер: его ответ
    // «сессии нет» снимает пользователя, и гард уводит на логин. `confirmed` не даёт
    // позднему чтению IDB перетереть уже пришедший ответ сервера.
    let confirmed = false;
    const settle = (next: User | null) => {
      confirmed = true;
      setUser(next);
    };
    void getLastKnownUser<User>()
      .then((known) => {
        if (known && !confirmed) setUser((current) => current ?? known);
      })
      .catch((err) => console.debug('[AuthProvider] last-known-user read failed', err));
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
            settle(lastKnownUser);
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
          // До settle: экраны читают IDB cache-first и не должны успеть увидеть данные
          // прежнего пользователя этого устройства. Сбой IDB вход не блокирует.
          try {
            await ensureOfflineOwner(String(data.user.directus_id));
          } catch (err) {
            console.error('[AuthProvider] offline owner check failed', err);
          }
          settle(data.user);
          void setLastKnownUser(data.user);
          // Только server-confirmed вход (не last-known-user фолбэк ниже) — иначе
          // офлайн-вход пытается качать данные без сети.
          scheduleEnsureOfflineData();
        } else {
          // Сервер явно ответил «сессии нет» — это НЕ повод для офлайн-фолбэка.
          settle(null);
        }
      } else {
        // response.ok === false — тоже реальное «сессии нет» (напр. 401), а не сетевая ошибка.
        settle(null);
      }
    } catch (error) {
      // fetch() упал (сеть недоступна) — единственный случай, где уместен офлайн-вход
      // по последнему подтверждённому пользователю.
      console.error('Error checking session:', error);
      const lastKnownUser = await getLastKnownUser<User>();
      if (lastKnownUser) {
        console.debug('[AuthProvider] offline — falling back to last-known-user');
        settle(lastKnownUser);
      } else {
        settle(null);
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
    <AuthContext.Provider value={{ user, loading, logout, refreshAuth: checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

