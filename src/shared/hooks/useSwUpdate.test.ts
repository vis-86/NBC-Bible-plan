import { describe, expect, it } from 'vitest';
import { isUpdateReady, shouldReloadOnControllerChange } from './useSwUpdate';

describe('isUpdateReady', () => {
  it('true когда воркер installed И уже есть controller (обновление поверх старой версии)', () => {
    expect(isUpdateReady('installed', true)).toBe(true);
  });

  it('false при первой установке (installed, но controller ещё нет)', () => {
    expect(isUpdateReady('installed', false)).toBe(false);
  });

  it('false для промежуточных состояний воркера', () => {
    expect(isUpdateReady('installing', true)).toBe(false);
    expect(isUpdateReady('activating', true)).toBe(false);
  });
});

describe('shouldReloadOnControllerChange', () => {
  it('true когда controller уже был ДО подписки и ещё не перезагружались (реальный апдейт)', () => {
    expect(shouldReloadOnControllerChange(true, false)).toBe(true);
  });

  it('false при первой установке (controller появился впервые)', () => {
    expect(shouldReloadOnControllerChange(false, false)).toBe(false);
  });

  it('false после уже выполненного reload (once-guard)', () => {
    expect(shouldReloadOnControllerChange(true, true)).toBe(false);
  });
});
