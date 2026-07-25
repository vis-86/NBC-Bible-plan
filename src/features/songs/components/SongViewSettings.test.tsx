// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SongViewSettings } from './SongViewSettings';
import { DEFAULT_SONG_VIEW_SETTINGS } from '../hooks/useSongViewSettings';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SongViewSettings', () => {
  it('disables "2 колонки" and shows a hint below the 640px breakpoint', () => {
    mockMatchMedia(false);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    const twoColumnsButton = screen.getByRole('button', { name: '2 колонки' });
    expect(twoColumnsButton).toBeDisabled();
    expect(screen.getByText(/2 колонки доступны на планшете/)).toBeInTheDocument();
  });

  it('enables "2 колонки" at or above the 640px breakpoint', () => {
    mockMatchMedia(true);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    const twoColumnsButton = screen.getByRole('button', { name: '2 колонки' });
    expect(twoColumnsButton).not.toBeDisabled();
    expect(screen.queryByText(/2 колонки доступны на планшете/)).not.toBeInTheDocument();
  });
});
