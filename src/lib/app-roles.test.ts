import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  APP_ROLE_TO_DIRECTUS_ROLE,
  APP_ROLES,
  canEditSongs,
  canManageSetlists,
  canManageTeam,
  isAppRole,
  resolveAppRole,
} from './app-roles';

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

  it('canManageSetlists is true for musician, musician_editor and team_admin', () => {
    expect(canManageSetlists('reader')).toBe(false);
    expect(canManageSetlists('musician')).toBe(true);
    expect(canManageSetlists('musician_editor')).toBe(true);
    expect(canManageSetlists('team_admin')).toBe(true);
  });

  it('canEditSongs is true for musician_editor and team_admin', () => {
    expect(canEditSongs('reader')).toBe(false);
    expect(canEditSongs('musician')).toBe(false);
    expect(canEditSongs('musician_editor')).toBe(true);
    expect(canEditSongs('team_admin')).toBe(true);
  });

  it('resolves the team_admin Directus role', () => {
    expect(resolveAppRole('team_admin')).toBe('team_admin');
    expect(resolveAppRole('TEAM_ADMIN')).toBe('team_admin');
  });

  it('canManageTeam is true only for team_admin', () => {
    expect(APP_ROLES.filter(canManageTeam)).toEqual(['team_admin']);
  });

  it('maps every app role to a Directus role name, reader to «Чтец»', () => {
    expect(APP_ROLE_TO_DIRECTUS_ROLE).toEqual({
      reader: 'Чтец',
      musician: 'musician',
      musician_editor: 'musician_editor',
      team_admin: 'team_admin',
    });
  });

  it('Directus role of each non-reader app role resolves back to the same app role', () => {
    for (const role of APP_ROLES.filter((r) => r !== 'reader')) {
      expect(resolveAppRole(APP_ROLE_TO_DIRECTUS_ROLE[role])).toBe(role);
    }
  });

  it('isAppRole accepts only known app roles', () => {
    for (const role of APP_ROLES) expect(isAppRole(role)).toBe(true);
    expect(isAppRole('admin')).toBe(false);
    expect(isAppRole('Чтец')).toBe(false);
    expect(isAppRole('')).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });
});
