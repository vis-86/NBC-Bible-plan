import { describe, expect, it } from 'vitest';
import { inkModeScrollTop } from './inkModeSpacer';

describe('inkModeScrollTop', () => {
  it('в середине песни компенсирует снятый отступ — текст стоит на месте', () => {
    expect(inkModeScrollTop(500, 52, true)).toBe(448);
  });

  it('в начале песни лист поднимается на место шапки', () => {
    expect(inkModeScrollTop(0, 52, true)).toBe(0);
    expect(inkModeScrollTop(30, 52, true)).toBe(0);
  });

  it('выход возвращает прокрутку туда, где текст стоял до входа', () => {
    expect(inkModeScrollTop(inkModeScrollTop(500, 52, true), 52, false)).toBe(500);
  });

  it('выход из начала песни оставляет лист в начале, а не под шапкой', () => {
    expect(inkModeScrollTop(0, 52, false)).toBe(0);
  });
});
