import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isRegistrationOpen, isChurchCodeRequired, verifyChurchCode } from './register-access';

describe('register-access', () => {
  const originalCode = process.env.REGISTER_CHURCH_CODE;
  const originalNoCode = process.env.REGISTER_OPEN_NO_CODE;

  beforeEach(() => {
    delete process.env.REGISTER_CHURCH_CODE;
    delete process.env.REGISTER_OPEN_NO_CODE;
  });

  afterEach(() => {
    if (originalCode === undefined) delete process.env.REGISTER_CHURCH_CODE;
    else process.env.REGISTER_CHURCH_CODE = originalCode;
    if (originalNoCode === undefined) delete process.env.REGISTER_OPEN_NO_CODE;
    else process.env.REGISTER_OPEN_NO_CODE = originalNoCode;
  });

  it('isChurchCodeRequired reflects whether the secret is set (non-empty)', () => {
    expect(isChurchCodeRequired()).toBe(false);
    process.env.REGISTER_CHURCH_CODE = 'secret-code';
    expect(isChurchCodeRequired()).toBe(true);
    process.env.REGISTER_CHURCH_CODE = '';
    expect(isChurchCodeRequired()).toBe(false);
  });

  it('isRegistrationOpen: open when the secret is set (code required)', () => {
    expect(isRegistrationOpen()).toBe(false);
    process.env.REGISTER_CHURCH_CODE = 'secret-code';
    expect(isRegistrationOpen()).toBe(true);
  });

  it('isRegistrationOpen: open without code when REGISTER_OPEN_NO_CODE is set', () => {
    process.env.REGISTER_OPEN_NO_CODE = 'true';
    expect(isRegistrationOpen()).toBe(true);
    expect(isChurchCodeRequired()).toBe(false);
    process.env.REGISTER_OPEN_NO_CODE = '1';
    expect(isRegistrationOpen()).toBe(true);
  });

  it('isRegistrationOpen: closed when no secret and no no-code flag', () => {
    expect(isRegistrationOpen()).toBe(false);
    process.env.REGISTER_OPEN_NO_CODE = 'false';
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
