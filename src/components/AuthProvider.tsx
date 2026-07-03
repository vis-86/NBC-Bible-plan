'use client';

import { createContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getApiPath } from '@/lib/utils';
import { isTelegramWebApp, initTelegramWebApp } from '@/lib/telegram';
import { getLastKnownUser, setLastKnownUser, clearLastKnownUser } from '@/shared/offline/lastKnownUser';

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
    try {
      const response = await fetch(getApiPath('/api/auth/session'), {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          void setLastKnownUser(data.user);
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

