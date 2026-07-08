'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ChromeVisibilityValue {
  chromeHidden: boolean;
  setChromeHidden: (hidden: boolean) => void;
}

const ChromeVisibilityContext = createContext<ChromeVisibilityValue | null>(null);

/**
 * Видимость нижнего chrome (BottomNavBar + плавающая навигация ридера) как
 * общее состояние shared-слоя: и DashboardLayout (BottomNavBar), и
 * features/reading (ReadingView, FloatingChapterNav) должны видеть один и тот
 * же флаг. Дефолт — always visible; страницы без скролл-детекции (всё, кроме
 * ридера) никогда не вызывают setChromeHidden(true) → нав всегда виден.
 */
export const ChromeVisibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chromeHidden, setChromeHiddenState] = useState(false);

  // useCallback (без зависимостей, функциональный updater) — стабильная identity
  // между рендерами, чтобы потребители могли безопасно класть setChromeHidden
  // в deps своих эффектов без лишних перезапусков.
  const setChromeHidden = useCallback((hidden: boolean) => {
    setChromeHiddenState((prev) => {
      if (prev !== hidden) {
        console.debug('[ChromeVisibility] chromeHidden', hidden);
      }
      return hidden;
    });
  }, []);

  const value = useMemo<ChromeVisibilityValue>(
    () => ({ chromeHidden, setChromeHidden }),
    [chromeHidden, setChromeHidden]
  );

  return <ChromeVisibilityContext.Provider value={value}>{children}</ChromeVisibilityContext.Provider>;
};

export function useChromeVisibility(): ChromeVisibilityValue {
  const ctx = useContext(ChromeVisibilityContext);
  if (!ctx) {
    throw new Error('useChromeVisibility must be used within a ChromeVisibilityProvider');
  }
  return ctx;
}

/**
 * Безопасная версия для переиспользуемых shared-компонентов (например,
 * `BottomSheet`), которые в теории могут отрендериться вне
 * `ChromeVisibilityProvider` (не только внутри `/dashboard/*`) — `null` вместо
 * throw, потребитель сам решает, что делать при отсутствии контекста.
 */
export function useOptionalChromeVisibility(): ChromeVisibilityValue | null {
  return useContext(ChromeVisibilityContext);
}
