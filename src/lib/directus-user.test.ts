import { describe, it, expect } from 'vitest';
import { loginToEmail, LOCAL_EMAIL_DOMAIN } from './directus-user';

describe('loginToEmail', () => {
  it('appends the synthetic domain for a bare handle', () => {
    expect(loginToEmail('ivan_nbc')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('lowercases the handle', () => {
    expect(loginToEmail('Ivan_NBC')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('passes through an explicit email (backward-compat)', () => {
    expect(loginToEmail('admin@example.com')).toBe('admin@example.com');
  });

  it('uses a domain with a real TLD (Directus rejects single-label like @local)', () => {
    // Регрессия: Directus валидирует формат email и отклоняет домены без точки
    // ("Value has to be a valid email address") → создание аккаунта падало с 500.
    const domain = loginToEmail('x').split('@')[1];
    expect(domain).toContain('.');
    expect(domain).not.toBe('local');
  });
});
