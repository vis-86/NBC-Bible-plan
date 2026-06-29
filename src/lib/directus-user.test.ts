import { describe, it, expect } from 'vitest';
import { loginToEmail, LOCAL_EMAIL_DOMAIN } from './directus-user';

describe('loginToEmail', () => {
  it('appends @local for a bare handle', () => {
    expect(loginToEmail('ivan_nbc')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('lowercases the handle', () => {
    expect(loginToEmail('Ivan_NBC')).toBe(`ivan_nbc@${LOCAL_EMAIL_DOMAIN}`);
  });

  it('passes through an explicit email (backward-compat)', () => {
    expect(loginToEmail('admin@example.com')).toBe('admin@example.com');
  });
});
