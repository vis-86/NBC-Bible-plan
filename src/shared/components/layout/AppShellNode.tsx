'use client';

import { createContext, useContext } from 'react';

/**
 * Узел оболочки дашборда (`div[data-dashboard-layout]`) — общая система
 * координат для всех оверлеев приложения.
 *
 * Оболочка намеренно сделана containing block'ом для `position: fixed`
 * потомков (`transform` в `.h-app-viewport`), поэтому её высота — измеренная,
 * а не соврaнная layout viewport'ом после поворота экрана. Оверлей, отрисованный
 * порталом в `document.body`, из этой системы выпадает: он снова привязывается
 * к вьюпорту и уезжает вместе с багом. Отсюда контекст — цель портала.
 */
export const AppShellNodeContext = createContext<HTMLElement | null>(null);

/**
 * Цель для порталов-оверлеев: узел оболочки дашборда, а вне дашборда
 * (лендинг, логин, регистрация) — `document.body`. `null` только на сервере.
 */
export function useAppShellPortalTarget(): HTMLElement | null {
  const shell = useContext(AppShellNodeContext);
  if (shell) return shell;
  return typeof document === 'undefined' ? null : document.body;
}
