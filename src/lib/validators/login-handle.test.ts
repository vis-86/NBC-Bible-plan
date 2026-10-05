import { describe, it, expect } from 'vitest';
import { loginHandleError } from './login-handle';
import { LoginHandleSchema } from './auth.schemas';

describe('loginHandleError', () => {
  it('валидный логин → null', () => {
    expect(loginHandleError('brother_ivan')).toBeNull();
    expect(loginHandleError('reader.01')).toBeNull();
  });

  it('кириллица → подсказка про раскладку', () => {
    expect(loginHandleError('иван')).toMatch(/латиницей/);
    expect(loginHandleError('ivanЁ')).toMatch(/латиницей/);
  });

  it('пробел, длина, спецсимволы', () => {
    expect(loginHandleError('has space')).toMatch(/пробел/);
    expect(loginHandleError('ab')).toMatch(/минимум 3/);
    expect(loginHandleError('x'.repeat(33))).toMatch(/максимум 32/);
    expect(loginHandleError('ivan!')).toMatch(/только латиница/);
  });

  it('согласован с серверной zod-схемой', () => {
    for (const v of ['brother_ivan', 'ab', 'иван', 'has space', 'ivan!', 'a-b.c_d', 'x'.repeat(33)]) {
      expect(loginHandleError(v) === null).toBe(LoginHandleSchema.safeParse(v).success);
    }
  });
});
