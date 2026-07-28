import { describe, expect, it } from 'vitest';
import { emailToLogin, loginToEmail, LOCAL_EMAIL_DOMAIN } from './local-email';

describe('emailToLogin', () => {
  it('возвращает логин из синтетического email', () => {
    expect(emailToLogin(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`)).toBe('ivan_nbc');
  });

  it('игнорирует регистр домена', () => {
    expect(emailToLogin(`ivan_nbc@${LOCAL_EMAIL_DOMAIN.toUpperCase()}`)).toBe('ivan_nbc');
  });

  it('возвращает null для чужого домена', () => {
    expect(emailToLogin('admin@example.com')).toBeNull();
  });

  it('возвращает null для пустых значений', () => {
    expect(emailToLogin('')).toBeNull();
    expect(emailToLogin(null)).toBeNull();
    expect(emailToLogin(undefined)).toBeNull();
  });

  it('возвращает null, если локальная часть пустая', () => {
    expect(emailToLogin(`@${LOCAL_EMAIL_DOMAIN}`)).toBeNull();
  });

  it('обратим с loginToEmail', () => {
    expect(emailToLogin(loginToEmail('Ivan_NBC'))).toBe('ivan_nbc');
  });
});
