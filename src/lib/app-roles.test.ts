import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAppRole, canManageSetlists, canEditSongs } from './app-roles';

describe('app-roles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves each known Directus role name', () => {
    expect(resolveAppRole('musician')).toBe('musician');
    expect(resolveAppRole('musician_editor')).toBe('musician_editor');
  });

  it('is case-insensitive', () => {
    expect(resolveAppRole('Musician')).toBe('musician');
    expect(resolveAppRole('MUSICIAN_EDITOR')).toBe('musician_editor');
  });

  it('defaults to reader for null/undefined', () => {
    expect(resolveAppRole(null)).toBe('reader');
    expect(resolveAppRole(undefined)).toBe('reader');
  });

  it('falls back to reader and warns for an unknown role name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveAppRole('Чтец')).toBe('reader');
    expect(resolveAppRole('some-unknown-role')).toBe('reader');
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('does not throw on unknown role name', () => {
    expect(() => resolveAppRole('anything')).not.toThrow();
  });

  it('canManageSetlists is true only for musician and musician_editor', () => {
    expect(canManageSetlists('reader')).toBe(false);
    expect(canManageSetlists('musician')).toBe(true);
    expect(canManageSetlists('musician_editor')).toBe(true);
  });

  it('canEditSongs is true only for musician_editor', () => {
    expect(canEditSongs('reader')).toBe(false);
    expect(canEditSongs('musician')).toBe(false);
    expect(canEditSongs('musician_editor')).toBe(true);
  });
});
