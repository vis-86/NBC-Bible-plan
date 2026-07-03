import { afterEach, describe, expect, it } from 'vitest';
import { getAppBuildTime } from './appVersion';

describe('getAppBuildTime', () => {
  const original = process.env.NEXT_PUBLIC_APP_BUILD_TIME;

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_BUILD_TIME = original;
  });

  it('возвращает значение из env, если оно задано', () => {
    process.env.NEXT_PUBLIC_APP_BUILD_TIME = '2026-07-02T10:00:00.000Z';
    expect(getAppBuildTime()).toBe('2026-07-02T10:00:00.000Z');
  });

  it('возвращает null, если env не задан', () => {
    delete process.env.NEXT_PUBLIC_APP_BUILD_TIME;
    expect(getAppBuildTime()).toBeNull();
  });
});
