// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { SongView } from './SongView';
import { SONG_SECTION_KIND_ATTR } from '../lib/songSectionKind';

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

  it('sets --chord-color on the root when chordColor is given, and omits it otherwise', () => {
    const { container } = render(<SongView content={CONTENT} chordColor="#0284c7" />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.style.getPropertyValue('--chord-color')).toBe('#0284c7');

    const bare = render(<SongView content={CONTENT} />).container.querySelector('[data-song-view]') as HTMLElement;
    expect(bare.style.getPropertyValue('--chord-color')).toBe('');
  });

  it('sets --chord-scale on the root when chordScale is given, and omits it otherwise', () => {
    const { container } = render(<SongView content={CONTENT} chordScale={1.1} />);
    const root = container.querySelector('[data-song-view]') as HTMLElement;
    expect(root.style.getPropertyValue('--chord-scale')).toBe('1.1');

    const bare = render(<SongView content={CONTENT} />).container.querySelector('[data-song-view]') as HTMLElement;
    expect(bare.style.getPropertyValue('--chord-scale')).toBe('');
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

  it('склейка строк включается только на широком экране с одной колонкой', () => {
    const narrow = render(<SongView content={CONTENT} columns={1} />);
    expect(narrow.container.querySelector('[data-song-view]')?.hasAttribute('data-pair-lines')).toBe(false);

    const wideOneColumn = render(<SongView content={CONTENT} columns={1} wideLayout />);
    expect(wideOneColumn.container.querySelector('[data-song-view]')?.hasAttribute('data-pair-lines')).toBe(true);

    // Две колонки: ширина уже поделена, склеивать нечего.
    const wideTwoColumns = render(<SongView content={CONTENT} columns={2} mode="sheets" wideLayout />);
    expect(wideTwoColumns.container.querySelector('[data-song-view]')?.hasAttribute('data-pair-lines')).toBe(false);
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

  it('chordDisplay сворачивает бас поверх транспозиции', () => {
    const content = '{comment: Куплет 1}\n[G/B]Хор [|]поёт [(пауза)] [Am7]тут';

    const noBass = render(<SongView content={content} chordDisplay="noBass" />);
    expect(Array.from(noBass.container.querySelectorAll('code.chord')).map((node) => node.textContent)).toEqual(['G', '|', '(пауза)', 'Am7']);

    const bassOnly = render(<SongView content={content} chordDisplay="bassOnly" />);
    expect(Array.from(bassOnly.container.querySelectorAll('code.chord')).map((node) => node.textContent)).toEqual(['B', '|', '(пауза)', 'A']);

    // Свёртка идёт ПОСЛЕ транспозиции: бас берётся из уже сдвинутого аккорда.
    const transposed = render(<SongView content={content} songKey="G" semitones={2} chordDisplay="bassOnly" />);
    expect(Array.from(transposed.container.querySelectorAll('code.chord')).map((node) => node.textContent)).toContain('C#');
  });

  it('по умолчанию (full) аккорды остаются с басом', () => {
    const { container } = render(<SongView content={'{comment: Куплет 1}\n[G/B]Хор'} />);
    expect(Array.from(container.querySelectorAll('code.chord')).map((node) => node.textContent)).toEqual(['G/B']);
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

  // В jsdom измерений нет (нулевые размеры), поэтому листы остаются неготовыми —
  // ровно то состояние, в котором на планшете успевала мелькнуть черновая страница.
  it('прячет листы, пока раскладка не измерена', () => {
    const { container } = render(<SongView content={CONTENT} fontSize={12} mode="sheets" />);
    const sheets = container.querySelector('[data-song-view-sheets]') as HTMLElement;

    expect(sheets.getAttribute('data-song-view-sheets-ready')).toBeNull();
    expect(sheets.className).toContain('invisible');
  });

  it('вид секции есть и в источнике-линейке, и в клонах листов', () => {
    const { container } = render(<SongView content={CONTENT} fontSize={12} mode="sheets" />);
    const sheetCount = container.querySelectorAll('[data-song-view-sheet]').length;
    expect(sheetCount).toBeGreaterThanOrEqual(1);

    // Источник + по копии на лист: рельс не должен теряться на второй странице.
    const expected = sheetCount + 1;
    expect(container.querySelectorAll(`[${SONG_SECTION_KIND_ATTR}="chorus"]`).length).toBe(expected);
    expect(container.querySelectorAll(`[${SONG_SECTION_KIND_ATTR}="verse"]`).length).toBe(expected);
  });
});
