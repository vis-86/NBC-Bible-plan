// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSongKey } from './useSongKey';
import type { Song } from '../types';

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: '1',
    title: 'Test',
    content: '[A]line',
    key: 'A',
    ...overrides,
  } as Song;
}

describe('useSongKey — капо', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('капо 0 ⇒ поведение как без него', () => {
    const { result } = renderHook(() => useSongKey(makeSong()));
    expect(result.current.capo).toBe(0);
    expect(result.current.renderSemitones).toBe(0);
    expect(result.current.shapeKey).toBe('A');
  });

  it('капо 2 при A ⇒ формы играются как в G', () => {
    const { result } = renderHook(() => useSongKey(makeSong()));
    act(() => result.current.setCapo(2));
    expect(result.current.capo).toBe(2);
    // Звучащая тональность не меняется.
    expect(result.current.effectiveKey).toBe('A');
    expect(result.current.semitones).toBe(0);
    // Формы на листе — на 2 полутона ниже: A → G.
    expect(result.current.shapeKey).toBe('G');
    expect(result.current.renderSemitones).toBe(10); // (0 - 2) mod 12
  });

  it('капо клэмпится в 0..9', () => {
    const { result } = renderHook(() => useSongKey(makeSong()));
    act(() => result.current.setCapo(20));
    expect(result.current.capo).toBe(9);
    act(() => result.current.setCapo(-3));
    expect(result.current.capo).toBe(0);
  });

  it('капо переживает смену тональности', () => {
    const { result } = renderHook(() => useSongKey(makeSong()));
    act(() => result.current.setCapo(2));
    act(() => result.current.setKey('C'));
    expect(result.current.capo).toBe(2);
    expect(result.current.effectiveKey).toBe('C');
    // Звучит C, формы на 2 ниже — Bb.
    expect(result.current.shapeKey).toBe('Bb');
  });

  it('сброс тональности обнуляет капо', () => {
    const { result } = renderHook(() => useSongKey(makeSong()));
    act(() => result.current.setKey('C'));
    act(() => result.current.setCapo(3));
    act(() => result.current.resetKey());
    expect(result.current.capo).toBe(0);
    expect(result.current.effectiveKey).toBe('A');
  });
});
