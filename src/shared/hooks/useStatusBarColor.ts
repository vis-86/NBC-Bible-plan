'use client';

import { useEffect } from 'react';
import {
  pushStatusBarColor,
  popStatusBarColor,
  type StatusBarColorValue,
} from '@/shared/utils/statusBarColor';

/**
 * Объявляет цвет брови (статус-бара) для текущего экрана на время его жизни.
 * Инвариант «бровь = цвет шапки экрана»: значение должно совпадать с фоном
 * шапки. Токены 'bg'/'surface' резолвятся по теме приложения; литеральный
 * цвет — для шапок вне app-токенов (ридер с темами light/dark/sepia).
 *
 * `null`/`undefined` — экран не переопределяет цвет (остаётся базовый --app-bg).
 */
export function useStatusBarColor(value: StatusBarColorValue | null | undefined): void {
  useEffect(() => {
    if (!value) return;
    const id = pushStatusBarColor(value);
    return () => popStatusBarColor(id);
  }, [value]);
}
