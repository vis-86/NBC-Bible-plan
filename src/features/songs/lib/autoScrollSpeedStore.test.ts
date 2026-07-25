// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STEP_INDEX } from './autoScroll';
import {
  SONG_AUTOSCROLL_LAST_STORAGE_KEY,
  SONG_AUTOSCROLL_SPEED_STORAGE_KEY,
  readSpeedStep,
  resetAutoScrollSpeedWarnings,
  subscribeAutoScrollSpeed,
  writeSpeedStep,
} from './autoScrollSpeedStore';

describe('autoScrollSpeedStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAutoScrollSpeedWarnings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('чтение без записи → дефолт', () => {
    expect(readSpeedStep('1')).toBe(DEFAULT_STEP_INDEX);
  });

  it('своя запись песни важнее последней глобальной', () => {
    writeSpeedStep('1', 5);
    writeSpeedStep('2', 10);
    expect(readSpeedStep('2')).toBe(10);
  });

  it('песня без своей записи наследует последнюю глобальную', () => {
    writeSpeedStep('1', 7);
    expect(readSpeedStep('2')).toBe(7);
  });

  it('запись обновляет и карту песни, и last', () => {
    writeSpeedStep('1', 4);
    expect(JSON.parse(localStorage.getItem(SONG_AUTOSCROLL_SPEED_STORAGE_KEY) as string)).toEqual({ 1: 4 });
    expect(localStorage.getItem(SONG_AUTOSCROLL_LAST_STORAGE_KEY)).toBe('4');
  });

  it('битый JSON в карте → дефолт + warn один раз', () => {
    localStorage.setItem(SONG_AUTOSCROLL_SPEED_STORAGE_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readSpeedStep('1')).toBe(DEFAULT_STEP_INDEX);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('недоступный localStorage не бросает', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => writeSpeedStep('1', 5)).not.toThrow();
    expect(readSpeedStep('1')).toBe(DEFAULT_STEP_INDEX);
    expect(warn).toHaveBeenCalled();
  });

  it('подписчик уведомляется после записи (включая неудачную), отписка работает', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAutoScrollSpeed(listener);

    writeSpeedStep('1', 5);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeSpeedStep('1', 6);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writeSpeedStep('1', 7);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('значения вне диапазона/нецелые в карте игнорируются', () => {
    localStorage.setItem(SONG_AUTOSCROLL_SPEED_STORAGE_KEY, JSON.stringify({ 1: 999, 2: -1, 3: 1.5, 4: 'x', 5: 10 }));
    expect(readSpeedStep('1')).toBe(DEFAULT_STEP_INDEX);
    expect(readSpeedStep('2')).toBe(DEFAULT_STEP_INDEX);
    expect(readSpeedStep('3')).toBe(DEFAULT_STEP_INDEX);
    expect(readSpeedStep('4')).toBe(DEFAULT_STEP_INDEX);
    expect(readSpeedStep('5')).toBe(10);
  });

  it('значение вне диапазона/нецелое в last игнорируется → дефолт', () => {
    localStorage.setItem(SONG_AUTOSCROLL_LAST_STORAGE_KEY, '999');
    expect(readSpeedStep('1')).toBe(DEFAULT_STEP_INDEX);
  });

  it('writeSpeedStep клампит вне диапазона', () => {
    writeSpeedStep('1', 999);
    expect(readSpeedStep('1')).toBe(29);
    writeSpeedStep('2', -5);
    expect(readSpeedStep('2')).toBe(0);
  });
});
