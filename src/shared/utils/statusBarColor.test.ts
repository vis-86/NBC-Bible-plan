// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STATUS_BAR_COLORS,
  setStatusBarBaseTheme,
  pushStatusBarColor,
  popStatusBarColor,
  resetStatusBarColorForTests,
} from './statusBarColor';

function metaContent(): string | null {
  return (
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? null
  );
}

describe('statusBarColor', () => {
  beforeEach(() => {
    resetStatusBarColorForTests();
    document.querySelector('meta[name="theme-color"]')?.remove();
  });

  it('база: цвет брови = --app-bg текущей темы', () => {
    setStatusBarBaseTheme('light');
    expect(metaContent()).toBe(STATUS_BAR_COLORS.light.bg);

    setStatusBarBaseTheme('dark');
    expect(metaContent()).toBe(STATUS_BAR_COLORS.dark.bg);
  });

  it('override-токен surface резолвится по текущей теме и пересчитывается при её смене', () => {
    setStatusBarBaseTheme('light');
    const id = pushStatusBarColor('surface');
    expect(metaContent()).toBe(STATUS_BAR_COLORS.light.surface);

    // Смена темы приложения при открытом экране с surface-шапкой
    setStatusBarBaseTheme('dark');
    expect(metaContent()).toBe(STATUS_BAR_COLORS.dark.surface);

    popStatusBarColor(id);
    expect(metaContent()).toBe(STATUS_BAR_COLORS.dark.bg);
  });

  it('литеральный цвет (ридер sepia) применяется как есть', () => {
    setStatusBarBaseTheme('light');
    const id = pushStatusBarColor('#fffbeb');
    expect(metaContent()).toBe('#fffbeb');
    popStatusBarColor(id);
    expect(metaContent()).toBe(STATUS_BAR_COLORS.light.bg);
  });

  it('побеждает последний запушенный; pop из середины не ломает стек', () => {
    setStatusBarBaseTheme('light');
    const surfaceId = pushStatusBarColor('surface');
    const readerId = pushStatusBarColor('#292524');
    expect(metaContent()).toBe('#292524');

    // Размонтирование нижнего экрана (не верхнего)
    popStatusBarColor(surfaceId);
    expect(metaContent()).toBe('#292524');

    popStatusBarColor(readerId);
    expect(metaContent()).toBe(STATUS_BAR_COLORS.light.bg);
  });

  it('создаёт meta-тег, если его нет в документе', () => {
    expect(metaContent()).toBeNull();
    setStatusBarBaseTheme('light');
    expect(metaContent()).toBe(STATUS_BAR_COLORS.light.bg);
  });
});
