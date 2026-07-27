// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SongViewSettings } from './SongViewSettings';
import { DEFAULT_SONG_VIEW_SETTINGS, MAX_FONT_SIZE, MIN_FONT_SIZE } from '../hooks/useSongViewSettings';

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
  it('hides the layout group (columns) below the 640px breakpoint', () => {
    mockMatchMedia(false);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.queryByText('Раскладка')).not.toBeInTheDocument();
    expect(screen.queryByText('Колонки')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2 колонки' })).not.toBeInTheDocument();
  });

  it('shows the layout group at or above the 640px breakpoint, with the mode hint', () => {
    mockMatchMedia(true);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.getByText('Раскладка')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 колонки' })).toBeEnabled();
    expect(screen.getByText(/Одна колонка — непрерывный скролл/)).toBeInTheDocument();
  });

  it('нет контрола «Режим просмотра» — режим выводится из колонок', () => {
    mockMatchMedia(true);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.queryByText('Режим просмотра')).not.toBeInTheDocument();
  });

  it('три заголовка групп отрендерены', () => {
    mockMatchMedia(true);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.getByText('Текст')).toBeInTheDocument();
    expect(screen.getByText('Раскладка')).toBeInTheDocument();
    expect(screen.getByText('Отображение')).toBeInTheDocument();
  });

  it('A+/A− меняют fontSize на ±1 и задизейблены на границах', () => {
    mockMatchMedia(false);
    const onSettingsChange = vi.fn();
    const { rerender } = render(
      <SongViewSettings isOpen settings={{ ...DEFAULT_SONG_VIEW_SETTINGS, fontSize: 17 }} onClose={() => {}} onSettingsChange={onSettingsChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Увеличить шрифт' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ fontSize: 18 });
    fireEvent.click(screen.getByRole('button', { name: 'Уменьшить шрифт' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ fontSize: 16 });

    rerender(<SongViewSettings isOpen settings={{ ...DEFAULT_SONG_VIEW_SETTINGS, fontSize: MIN_FONT_SIZE }} onClose={() => {}} onSettingsChange={onSettingsChange} />);
    expect(screen.getByRole('button', { name: 'Уменьшить шрифт' })).toBeDisabled();

    rerender(<SongViewSettings isOpen settings={{ ...DEFAULT_SONG_VIEW_SETTINGS, fontSize: MAX_FONT_SIZE }} onClose={() => {}} onSettingsChange={onSettingsChange} />);
    expect(screen.getByRole('button', { name: 'Увеличить шрифт' })).toBeDisabled();
  });

  it('выбор колонок вызывает onSettingsChange({ columns })', () => {
    mockMatchMedia(true);
    const onSettingsChange = vi.fn();
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={onSettingsChange} />);

    fireEvent.click(screen.getByRole('button', { name: '2 колонки' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ columns: 2 });
  });

  it('keeps font size, density and toggles available on mobile', () => {
    mockMatchMedia(false);
    render(<SongViewSettings isOpen settings={DEFAULT_SONG_VIEW_SETTINGS} onClose={() => {}} onSettingsChange={() => {}} />);

    expect(screen.getByText(/Размер шрифта/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Компактно' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Аккорды' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Заголовок песни' })).toBeInTheDocument();
  });
});
