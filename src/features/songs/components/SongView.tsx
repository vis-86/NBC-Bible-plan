'use client';

import type React from 'react';
import { useMemo, useRef, type RefObject } from 'react';
import { cn } from '@/shared/utils/cn';
import { parseSongBlocks } from '../lib/songParser';
import { transposeLine } from '../lib/transpose';
import { useSheets } from '../hooks/useSheets';
import { PAGE_PADDING, SHEET_PADDING_TOP } from '../lib/sheets';
import ChordProHtmlColumn, { type HtmlSection } from './render/ChordProHtmlColumn';
import './render/songs.css';

interface SongViewProps {
  /** Сырой ChordPro-контент песни. */
  content: string;
  title?: string;
  subtitle?: string;
  /**
   * Тональность ФОРМ аккордов на листе (проп назван songKey, чтобы не путать с React key).
   * Задаёт спеллинг диезов/бемолей при транспозиции (§10.2) — обязан совпадать с реально
   * напечатанными аккордами. При каподастре это НЕ звучащая тональность (см. `metaKey`).
   */
  songKey?: string;
  /**
   * ЗВУЧАЩАЯ тональность для плашки `key · tempo`. По умолчанию = `songKey`; расходится с
   * ним только при каподастре (формы на листе ниже звучащей). Показывается пользователю.
   */
  metaKey?: string;
  /** Сдвиг для рендера листа. 0 ⇒ рендер идёт по исходным строкам. */
  semitones?: number;
  tempo?: string;
  /** Размер шрифта лирики в px — задаёт CSS-переменную `--lyric-size` на корне. */
  fontSize?: number;
  /** Скрыть аккорды (режим «только текст») — переключает `data-chords="off"` на корне. */
  hideChords?: boolean;
  /** Плотность строк/секций — переключает `data-density` на корне (§5). */
  density?: 'comfortable' | 'compact';
  /** Показывать шапку (title/subtitle/key·tempo) — по умолчанию показана. */
  showHeader?: boolean;
  /**
   * Эффективный режим раскладки (§4.5). Приводить `sheets` к `scroll` на узком
   * экране обязан вызывающий — по `SONG_WIDE_LAYOUT_QUERY`, той же константе, что прячет
   * контролы в панели настроек.
   */
  mode?: 'scroll' | 'sheets';
  /** Число колонок в постраничных режимах; в `scroll` всегда одна (§4.1). */
  columns?: 1 | 2;
  /** Скролл-контейнер страницы — из его высоты берётся высота листа (§4.2). */
  viewportRef?: RefObject<HTMLElement | null>;
}

/**
 * Просмотр песни: шапка + ОДИН multicol-поток со всеми секциями.
 *
 * Поток один намеренно: multicol раскладывает по колонкам содержимое одного потока,
 * поэтому прежняя схема «блок = свой контейнер» с колонками несовместима.
 * В режиме `sheets` источник схлопнут и служит линейкой, а видимые листы — окна,
 * вырезающие свою страницу сдвигом одинаковой копии (§4.2).
 */
export const SongView: React.FC<SongViewProps> = ({
  content,
  title,
  subtitle,
  songKey,
  metaKey,
  semitones = 0,
  tempo,
  fontSize,
  hideChords = false,
  density = 'comfortable',
  showHeader = true,
  mode = 'scroll',
  columns = 1,
  viewportRef,
}) => {
  const sections = useMemo<HtmlSection[]>(
    () =>
      parseSongBlocks(content).map((block) => {
        const lines = block.content.split('\n');
        return {
          comment: block.comment || undefined,
          commentType: block.commentType || undefined,
          // При нулевом сдвиге строки идут как есть — без копирования и без работы.
          lines: semitones === 0 ? lines : lines.map((line) => transposeLine(line, semitones, songKey ?? '')),
        };
      }),
    [content, semitones, songKey],
  );

  if (process.env.NODE_ENV !== 'production') {
    // Standard logging: сколько секций распарсили (диагностика пустых/битых песен).
    console.debug(`[SongView] parsed ${sections.length} section(s)`, { title });
  }

  const sourceRef = useRef<HTMLDivElement>(null);
  // Две колонки существуют только вместе с постраничным режимом (§4.1).
  const effectiveColumns = mode === 'scroll' ? 1 : columns;
  const sheets = useSheets({
    enabled: mode !== 'scroll',
    sourceRef,
    viewportRef,
    // Транспозиция входит в подпись: `Bb7` шире `A7`, ширина аккордов меняет разбивку,
    // а без пересборки лист остался бы обрезанным или пустым.
    layoutSignature: `${mode}|${effectiveColumns}|${density}|${hideChords ? 'off' : 'on'}|${sections.length}|${semitones}`,
    fontSize: fontSize ?? 0,
    // PAGE_PADDING — нижнее поле корня: `chromeAboveFlow` меряет только то, что над потоком.
    reservedHeight: SHEET_PADDING_TOP + PAGE_PADDING,
  });

  // Плашка показывает ЗВУЧАЩУЮ тональность (metaKey), а не форму (songKey): при капо это
  // разные значения, а видеть пользователь должен то, в чём песня звучит.
  const meta = [metaKey ?? songKey, tempo].filter(Boolean).join(' · ');
  const rootStyle = {
    ...(fontSize ? { '--lyric-size': `${fontSize}px` } : null),
    '--col-count': effectiveColumns,
    ...(sheets.pageHeight ? { '--page-h': `${sheets.pageHeight}px` } : null),
  } as React.CSSProperties;

  return (
    <article
      // В постраничных режимах поля живут здесь, а не на скролл-контейнере:
      // боковое (px-4) лист компенсирует наружу и держит внутри себя, вертикальное
      // (py-2 = PAGE_PADDING) вычитается из высоты страницы.
      className={cn('cproSongBody', mode !== 'scroll' && 'px-4 py-2')}
      data-song-view
      data-chords={hideChords ? 'off' : undefined}
      data-density={density}
      data-mode={mode}
      style={rootStyle}
    >
      {showHeader && (title || subtitle || meta) && (
        <header className="song-view-header" data-song-view-header>
          {title && <h1 className="song-view-title" data-song-view-title>{title}</h1>}
          {subtitle && <p className="song-view-subtitle" data-song-view-subtitle>{subtitle}</p>}
          {meta && (
            <div className="song-view-header-row" data-song-view-header-row>
              <span className="song-view-meta" data-song-view-meta>{meta}</span>
            </div>
          )}
        </header>
      )}

      {/* Источник разбивки. В `sheets` обёртка схлопнута в ноль, но остаётся в потоке
          и внутри того же контейнера типографики — иначе клон разобьётся иначе
          и появятся пустые листы (подводный камень 2, §4.2). */}
      <div
        className="cproSongMeasure"
        data-song-view-measure
        aria-hidden={mode === 'sheets' ? true : undefined}
      >
        <div ref={sourceRef} className="cproColumn" data-song-view-flow>
          <ChordProHtmlColumn sections={sections} />
        </div>
      </div>

      {mode === 'sheets' && (
        <div className="sheets" data-song-view-sheets style={sheets.width ? { width: `${sheets.width}px` } : undefined}>
          {Array.from({ length: sheets.count }, (_, index) => (
            <div key={index} className="sheet" data-song-view-sheet style={{ paddingTop: SHEET_PADDING_TOP }}>
              <div
                className="sheet-flow"
                style={{
                  width: sheets.width ? `${sheets.width}px` : undefined,
                  transform: `translateX(-${index * sheets.pitch}px)`,
                }}
              >
                <ChordProHtmlColumn sections={sections} />
              </div>
              <span className="sheet-num" data-song-view-sheet-number>
                {index + 1} / {sheets.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

export default SongView;
