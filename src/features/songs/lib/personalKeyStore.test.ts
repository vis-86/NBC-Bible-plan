// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SONG_PERSONAL_KEYS_STORAGE_KEY,
  clearPersonalKey,
  readPersonalKey,
  resetPersonalKeyWarnings,
  subscribePersonalKeys,
  writePersonalKey,
} from './personalKeyStore';

describe('personalKeyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPersonalKeyWarnings();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('пишет, читает и сбрасывает личную тональность', () => {
    expect(readPersonalKey('42')).toBeUndefined();

    writePersonalKey('42', 'Ab');
    expect(readPersonalKey('42')).toBe('Ab');

    clearPersonalKey('42');
    expect(readPersonalKey('42')).toBeUndefined();
  });

  it('держит тональности разных песен в одном ключе, не затирая друг друга', () => {
    writePersonalKey('1', 'G');
    writePersonalKey('2', 'Em');

    expect(readPersonalKey('1')).toBe('G');
    expect(readPersonalKey('2')).toBe('Em');
    expect(Object.keys(JSON.parse(localStorage.getItem(SONG_PERSONAL_KEYS_STORAGE_KEY) as string))).toEqual(['1', '2']);
  });

  it('сброс несуществующей песни не ломает остальные записи', () => {
    writePersonalKey('1', 'G');
    clearPersonalKey('999');
    expect(readPersonalKey('1')).toBe('G');
  });

  it('подписчик уведомляется о записи и сбросе, отписка работает', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePersonalKeys(listener);

    writePersonalKey('42', 'Ab');
    expect(listener).toHaveBeenCalledTimes(1);

    clearPersonalKey('42');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writePersonalKey('42', 'G');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('битый JSON → пусто, без исключения', () => {
    localStorage.setItem(SONG_PERSONAL_KEYS_STORAGE_KEY, '{не json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(readPersonalKey('42')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('нестроковые и пустые значения игнорируются', () => {
    localStorage.setItem(SONG_PERSONAL_KEYS_STORAGE_KEY, JSON.stringify({ 1: 42, 2: '', 3: 'G' }));

    expect(readPersonalKey('1')).toBeUndefined();
    expect(readPersonalKey('2')).toBeUndefined();
    expect(readPersonalKey('3')).toBe('G');
  });

  it('массив вместо объекта → пусто', () => {
    localStorage.setItem(SONG_PERSONAL_KEYS_STORAGE_KEY, JSON.stringify(['G']));
    expect(readPersonalKey('0')).toBeUndefined();
  });

  it('недоступный localStorage не бросает, warn ровно один раз', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => writePersonalKey('42', 'Ab')).not.toThrow();
    expect(readPersonalKey('42')).toBeUndefined();
    expect(() => clearPersonalKey('42')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
