import { describe, expect, it } from 'vitest';
import { inkSpacerScrollTop } from './inkModeSpacer';

describe('inkSpacerScrollTop', () => {
  it('в начале песни на входе не компенсирует — лист отъезжает под плашку', () => {
    expect(inkSpacerScrollTop(0, 62, true)).toBe(0);
    expect(inkSpacerScrollTop(30, 62, true)).toBe(30);
  });

  it('в середине песни на входе компенсирует — текст стоит на месте', () => {
    expect(inkSpacerScrollTop(62, 62, true)).toBe(124);
    expect(inkSpacerScrollTop(500, 62, true)).toBe(562);
  });

  it('на выходе снимает отступ с прокрутки', () => {
    expect(inkSpacerScrollTop(562, 62, false)).toBe(500);
  });

  it('на выходе у верха не уходит в минус', () => {
    expect(inkSpacerScrollTop(20, 62, false)).toBe(0);
  });
});
