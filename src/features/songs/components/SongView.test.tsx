// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { SongView } from './SongView';

const CONTENT = '{comment: Куплет 1}\n[Am]Хор поёт [F]тут\n\n{comment: Припев}\n[C]Второй [G]блок';

// jsdom не реализует ResizeObserver, а useSheets подписывается на него.
// Раскладку он тут всё равно не считает (нет layout) — достаточно заглушки.
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

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

  it('renders all sections in a single multicol flow (multicol works on one flow only)', () => {
    const { container } = render(<SongView content={CONTENT} />);
    expect(container.querySelectorAll('.cproColumn').length).toBe(1);
    expect(container.querySelectorAll('.cproColumn .cproSongSection').length).toBe(2);
  });

  it('keeps a single column in scroll mode even when two are requested (§4.1)', () => {
    const { container } = render(<SongView content={CONTENT} columns={2} mode="scroll" />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.style.getPropertyValue('--col-count')).toBe('1');
    expect(container.querySelector('[data-song-view-sheets]')).toBeNull();
  });

  it('applies the requested column count in sheets mode', () => {
    const { container } = render(<SongView content={CONTENT} columns={2} mode="sheets" />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.style.getPropertyValue('--col-count')).toBe('2');
  });

  it('shows the pager with a page indicator in paged mode only', () => {
    const scroll = render(<SongView content={CONTENT} mode="scroll" />);
    expect(scroll.container.querySelector('[data-song-view-pager]')).toBeNull();
    scroll.unmount();

    const { container } = render(<SongView content={CONTENT} mode="paged" columns={2} />);
    expect(container.querySelector('[data-song-view-pager-count]')?.textContent).toBe('1 / 1');
    // На первой странице назад листать некуда, вперёд — тоже (страница одна).
    expect((container.querySelector('[data-song-view-pager-prev]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('[data-song-view-pager-next]') as HTMLButtonElement).disabled).toBe(true);
    // Клонов в paged нет — листается сам поток (§4.4).
    expect(container.querySelector('[data-song-view-sheets]')).toBeNull();
  });

  it('транспонирует аккорды при ненулевом сдвиге, не трогая такты и пометки', () => {
    const content = '{comment: Куплет 1}\n[Am]Хор [|]поёт [(пауза)] [F]тут';
    const { container } = render(<SongView content={content} songKey="Bm" semitones={2} />);
    const chords = Array.from(container.querySelectorAll('code.chord')).map((node) => node.textContent);

    expect(chords).toContain('Bm');
    expect(chords).toContain('G');
    expect(chords).not.toContain('Am');
    // Такт и текстовая пометка транспозиции не подлежат (§10.3).
    expect(chords).toContain('|');
    expect(chords).toContain('(пауза)');
  });

  it('при нулевом сдвиге аккорды остаются исходными', () => {
    const { container } = render(<SongView content={CONTENT} songKey="Am" semitones={0} />);
    const chords = Array.from(container.querySelectorAll('code.chord')).map((node) => node.textContent);
    expect(chords).toEqual(expect.arrayContaining(['Am', 'F', 'C', 'G']));
  });

  it('плашка показывает тональность и темп', () => {
    const { container } = render(<SongView content={CONTENT} title="Песня" songKey="G" tempo="72" />);
    expect(container.querySelector('[data-song-view-meta]')?.textContent).toBe('G · 72');
  });

  it('при капо плашка показывает звучащую тональность (metaKey), а не форму (songKey)', () => {
    // songKey=G — форма на листе; metaKey=A — звучащая тональность (капо 2).
    const { container } = render(<SongView content={CONTENT} title="Песня" songKey="G" metaKey="A" tempo="72" />);
    expect(container.querySelector('[data-song-view-meta]')?.textContent).toBe('A · 72');
  });

  // Подводный камень 2 (§4.2): клон, из которого вырезаются листы, обязан наследовать
  // ту же типографику, что и источник, — значит лежать внутри того же корня.
  it('renders sheets inside the same typography root as the measured source', () => {
    const { container } = render(<SongView content={CONTENT} fontSize={12} mode="sheets" />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    const sheets = container.querySelector('[data-song-view-sheets]') as HTMLElement;
    const source = container.querySelector('[data-song-view-flow]') as HTMLElement;

    expect(root.contains(sheets)).toBe(true);
    expect(root.contains(source)).toBe(true);
    // Источник остаётся в DOM (по нему считается разбивка), но скрыт от скринридера —
    // содержимое уже озвучено листами.
    expect(container.querySelector('[data-song-view-measure]')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('[data-song-view-sheet]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-song-view-sheet-number]')?.textContent).toBe('1 / 1');
  });
});
