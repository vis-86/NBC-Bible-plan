'use client';

import { createContext, useEffect, useRef, useState, ReactNode } from 'react';
import { getApiPath, getBasePath } from '@/lib/utils';
import { isTelegramWebApp, initTelegramWebApp } from '@/lib/telegram';
import { getLastKnownUser, setLastKnownUser, clearLastKnownUser } from '@/shared/offline/lastKnownUser';
import { raceNetwork } from '@/shared/offline/networkHealth';
import { DEFAULT_NETWORK_TIMEOUT_MS, isNetworkTimeout } from '@/shared/offline/networkTimeout';
import { scheduleEnsureOfflineData } from '@/shared/offline/autoDownload';
import { claimOwnerFromLastKnownUser, ensureOfflineOwner } from '@/shared/offline/offlineOwner';
import { replayOutbox } from '@/shared/offline/sync';
import { SETLIST_DRAFT_STORAGE_KEY } from '@/features/setlists/hooks/useSetlistDraft';

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
  // Поколение сессии: logout/истечение сессии увеличивают его, и проверка сессии,
  // стартовавшая раньше, не возвращает пользователя после выхода.
  const generationRef = useRef(0);

  useEffect(() => {
    checkSession();
  }, []);

  // Telegram Mini App: expand to full height and apply header color from theme
  useEffect(() => {
    if (isTelegramWebApp()) {
      initTelegramWebApp();
    }
  }, []);

  // Снятие last-known-user: сначала закрепляем владельца устройства, чтобы вход другого
  // пользователя очистил данные, а не принял их как свои.
  const forgetLastKnownUser = async () => {
    await claimOwnerFromLastKnownUser();
    await clearLastKnownUser();
  };

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
    const generation = generationRef.current;
    const isStale = () => {
      const stale = generationRef.current !== generation;
      if (stale) console.debug('[AuthProvider] session check superseded by logout — result ignored');
      return stale;
    };
    let confirmed = false;
    let reloading = false;
    const settle = (next: User | null) => {
      confirmed = true;
      setUser(next);
    };
    void getLastKnownUser<User>()
      .then((known) => {
        if (known && !confirmed && generationRef.current === generation) setUser((current) => current ?? known);
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
          if (isStale()) return;
          if (lastKnownUser) {
            console.debug('[FIX][AuthProvider] session check timed out — falling back to last-known-user');
            settle(lastKnownUser);
            return;
          }
          // Фолбэка нет — дожидаемся медленную сеть (лучше, чем выкинуть на логин).
          response = await sessionFetch;
          if (isStale()) return;
        } else {
          throw err;
        }
      }

      if (isStale()) return;
      if (response.ok) {
        const data = await response.json();
        if (isStale()) return;
        if (data.user) {
          // До settle: экраны читают IDB cache-first и не должны успеть увидеть данные
          // прежнего пользователя этого устройства. Сбой IDB вход не блокирует.
          const ownerId = data.user.directus_id;
          if (typeof ownerId === 'string' && ownerId !== '') {
            try {
              if ((await ensureOfflineOwner(ownerId)) === 'wiped') {
                // Черновик сета лежит в localStorage (features-слой), чужой команды — снимаем.
                try {
                  window.localStorage.removeItem(SETLIST_DRAFT_STORAGE_KEY);
                } catch {
                  // localStorage недоступен — черновика всё равно не прочитать
                }
                // Кеши в памяти модулей (списки, песни) пережили смену аккаунта —
                // перезагрузка страницы их сбрасывает; владелец уже новый, цикла нет.
                if (!isStale()) {
                  await setLastKnownUser(data.user);
                  reloading = true; // loading остаётся true: гард не уводит на логин до перезагрузки
                  window.location.reload();
                }
                return;
              }
            } catch (err) {
              console.error('[AuthProvider] offline owner check failed', err);
            }
          } else {
            console.error('[AuthProvider] session user has no directus_id — offline owner check skipped');
          }
          if (isStale()) return;
          settle(data.user);
          await setLastKnownUser(data.user);
          if (isStale()) return;
          // Только server-confirmed вход (не last-known-user фолбэк ниже) — иначе
          // офлайн-вход пытается качать данные без сети.
          scheduleEnsureOfflineData();
          // Владелец и last-known-user уже записаны — отложенные записи уходят сразу.
          void replayOutbox();
        } else {
          // Сервер явно ответил «сессии нет» — это НЕ повод для офлайн-фолбэка.
          await forgetLastKnownUser();
          if (isStale()) return;
          settle(null);
        }
      } else if (response.status === 401 || response.status === 403) {
        // Реальное «сессии нет», а не сетевая ошибка.
        await forgetLastKnownUser();
        if (isStale()) return;
        settle(null);
      } else {
        // 5xx (например, 502 при деплое) — сервер недоступен, как сеть: офлайн-фолбэк.
        throw new Error(`session check failed: HTTP ${response.status}`);
      }
    } catch (error) {
      // fetch() упал (сеть недоступна) — единственный случай, где уместен офлайн-вход
      // по последнему подтверждённому пользователю.
      console.error('Error checking session:', error);
      const lastKnownUser = await getLastKnownUser<User>();
      if (isStale()) return;
      if (lastKnownUser) {
        console.debug('[AuthProvider] offline — falling back to last-known-user');
        settle(lastKnownUser);
      } else {
        settle(null);
      }
    } finally {
      if (!reloading) setLoading(false);
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
      generationRef.current += 1;
      setUser(null);
      void forgetLastKnownUser()
        .then(() => fetch(getApiPath('/api/auth/logout'), { method: 'POST', credentials: 'include' }))
        .catch(() => {})
        // Полная навигация: модульные кеши (списки, песни) умирают вместе со страницей.
        .finally(() => window.location.replace(`${getBasePath()}/login`));
    };
    return () => {
      delete (globalThis as unknown as { __onSessionExpired?: () => void }).__onSessionExpired;
    };
  }, []);

  const logout = async () => {
    generationRef.current += 1;
    try {
      await fetch(getApiPath('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
      await forgetLastKnownUser();
      window.location.replace(`${getBasePath()}/login`);
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

