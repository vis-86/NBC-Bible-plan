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
  it('hides the layout controls (mode/columns) below the 640px breakpoint', () => {
    mockMatchMedia(false);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.queryByText('Режим просмотра')).not.toBeInTheDocument();
    expect(screen.queryByText('Колонки')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2 колонки' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Постранично' })).not.toBeInTheDocument();
  });

  it('shows the layout controls at or above the 640px breakpoint', () => {
    mockMatchMedia(true);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.getByText('Режим просмотра')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 колонки' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Постранично' })).toBeEnabled();
  });

  it('keeps font size, density and toggles available on mobile', () => {
    mockMatchMedia(false);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.getByText(/Размер шрифта/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Компактно' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Показывать аккорды' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Показывать шапку' })).toBeInTheDocument();
  });
});
