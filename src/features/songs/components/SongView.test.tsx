// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SongView } from './SongView';

const CONTENT = '{comment: Куплет 1}\n[Am]Хор поёт [F]тут';

describe('SongView', () => {
  it('sets --lyric-size on the root instead of inline font-size on descendants', () => {
    const { container } = render(<SongView content={CONTENT} fontSize={22} />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.style.getPropertyValue('--lyric-size')).toBe('22px');
    expect(container.querySelectorAll('[style*="font-size"]').length).toBe(0);
  });

  it('marks data-chords="off" when hideChords is set, without stripping chord markup from the DOM', () => {
    const { container } = render(<SongView content={CONTENT} hideChords />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.getAttribute('data-chords')).toBe('off');
    // Аккорд остаётся в DOM (скрыт через CSS `[data-chords="off"] .chord`), а не вырезается рендером.
    expect(container.querySelector('code.chord')).not.toBeNull();
  });

  it('does not set data-chords when hideChords is false', () => {
    const { container } = render(<SongView content={CONTENT} />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.hasAttribute('data-chords')).toBe(false);
  });
});
