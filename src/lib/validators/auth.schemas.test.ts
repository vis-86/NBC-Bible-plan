import { describe, it, expect } from 'vitest';
import {
  LoginHandleSchema,
  PasswordSchema,
  LoginSchema,
  ActivateSchema,
  TelegramLinkSchema,
  RegisterSchema,
} from './auth.schemas';

describe('auth.schemas', () => {
  it('LoginHandleSchema accepts valid handles', () => {
    expect(LoginHandleSchema.safeParse('ivan_nbc').success).toBe(true);
    expect(LoginHandleSchema.safeParse('reader.01').success).toBe(true);
  });

  it('LoginHandleSchema rejects too short / bad chars / cyrillic', () => {
    expect(LoginHandleSchema.safeParse('ab').success).toBe(false);
    expect(LoginHandleSchema.safeParse('иван').success).toBe(false);
    expect(LoginHandleSchema.safeParse('has space').success).toBe(false);
  });

  it('PasswordSchema enforces 8..128', () => {
    expect(PasswordSchema.safeParse('1234567').success).toBe(false);
    expect(PasswordSchema.safeParse('12345678').success).toBe(true);
    expect(PasswordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('LoginSchema requires login and password', () => {
    expect(LoginSchema.safeParse({ login: 'ivan', password: 'secret123' }).success).toBe(true);
    expect(LoginSchema.safeParse({ login: '', password: 'secret123' }).success).toBe(false);
  });

  it('ActivateSchema requires token + valid password, login optional', () => {
    expect(ActivateSchema.safeParse({ token: 'abcdefghij', password: 'secret123' }).success).toBe(true);
    expect(
      ActivateSchema.safeParse({ token: 'abcdefghij', login: 'ivan_nbc', displayName: 'Иван', password: 'secret123' }).success
    ).toBe(true);
    expect(ActivateSchema.safeParse({ token: 'short', password: 'secret123' }).success).toBe(false);
    expect(ActivateSchema.safeParse({ token: 'abcdefghij', password: 'short' }).success).toBe(false);
  });

  it('TelegramLinkSchema requires initData + credentials', () => {
    expect(
      TelegramLinkSchema.safeParse({ initData: 'x', login: 'ivan', password: 'secret123' }).success
    ).toBe(true);
    expect(TelegramLinkSchema.safeParse({ initData: '', login: 'ivan', password: 'p' }).success).toBe(false);
  });

  it('RegisterSchema requires login + password, churchCode + displayName optional', () => {
    expect(
      RegisterSchema.safeParse({ login: 'ivan_nbc', password: 'secret123', churchCode: 'code' }).success
    ).toBe(true);
    expect(
      RegisterSchema.safeParse({ login: 'ivan_nbc', displayName: 'Иван', password: 'secret123', churchCode: 'code' }).success
    ).toBe(true);
    // churchCode опционален (обязательность решает сервер: isChurchCodeRequired)
    expect(RegisterSchema.safeParse({ login: 'ivan_nbc', password: 'secret123' }).success).toBe(true);
    expect(RegisterSchema.safeParse({ login: 'ivan_nbc', password: 'secret123', churchCode: '' }).success).toBe(true);
    // login/password по-прежнему валидируются
    expect(RegisterSchema.safeParse({ login: 'ab', password: 'secret123', churchCode: 'code' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ login: 'ivan_nbc', password: 'short', churchCode: 'code' }).success).toBe(false);
    // churchCode ограничен по длине
    expect(RegisterSchema.safeParse({ login: 'ivan_nbc', password: 'secret123', churchCode: 'x'.repeat(129) }).success).toBe(false);
  });
});
