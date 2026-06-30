import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isRegistrationOpen, verifyChurchCode } from './register-access';

describe('register-access', () => {
  const original = process.env.REGISTER_CHURCH_CODE;

  beforeEach(() => {
    delete process.env.REGISTER_CHURCH_CODE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.REGISTER_CHURCH_CODE;
    else process.env.REGISTER_CHURCH_CODE = original;
  });

  it('isRegistrationOpen reflects whether the secret is set', () => {
    expect(isRegistrationOpen()).toBe(false);
    process.env.REGISTER_CHURCH_CODE = 'secret-code';
    expect(isRegistrationOpen()).toBe(true);
    process.env.REGISTER_CHURCH_CODE = '';
    expect(isRegistrationOpen()).toBe(false);
  });

  it('verifyChurchCode returns false when registration is closed', () => {
    expect(verifyChurchCode('anything')).toBe(false);
  });

  it('verifyChurchCode matches only the exact code (timing-safe)', () => {
    process.env.REGISTER_CHURCH_CODE = 'church-2026';
    expect(verifyChurchCode('church-2026')).toBe(true);
    expect(verifyChurchCode('wrong-code-x')).toBe(false);
  });

  it('verifyChurchCode handles length mismatch without throwing', () => {
    process.env.REGISTER_CHURCH_CODE = 'church-2026';
    // короче и длиннее ожидаемого — guard по длине, без throw из timingSafeEqual
    expect(() => verifyChurchCode('short')).not.toThrow();
    expect(verifyChurchCode('short')).toBe(false);
    expect(verifyChurchCode('church-2026-and-more')).toBe(false);
  });

  it('verifyChurchCode treats empty provided code as invalid', () => {
    process.env.REGISTER_CHURCH_CODE = 'church-2026';
    expect(verifyChurchCode('')).toBe(false);
  });
});
