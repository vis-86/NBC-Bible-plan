'use client';

import type React from 'react';
import { useMemo, useRef, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { parseSongBlocks } from '../lib/songParser';
import { transposeLine } from '../lib/transpose';
import { useSheets } from '../hooks/useSheets';
import { usePagedFlow } from '../hooks/usePagedFlow';
import { PAGE_PADDING, PAGER_HEIGHT, SHEET_PADDING_TOP } from '../lib/sheets';
import ChordProHtmlColumn, { type HtmlSection } from './render/ChordProHtmlColumn';
import './render/songs.css';

interface SongViewProps {
  /** Сырой ChordPro-контент песни. */
  content: string;
  title?: string;
  subtitle?: string;
  /**
   * ДЕЙСТВУЮЩАЯ тональность (§10.1; проп назван songKey, чтобы не путать с React key).
   * Показывается в шапке и задаёт спеллинг диезов/бемолей при транспозиции (§10.2),
   * поэтому источник у отображения и у транспозиции один.
   */
  songKey?: string;
  /** Сдвиг от исходной тональности к действующей. 0 ⇒ рендер идёт по исходным строкам. */
  semitones?: number;
  /** Селектор тональности — слот в шапке песни (§3.5). Владелец персиста — страница. */
  keyPicker?: React.ReactNode;
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
   * Эффективный режим раскладки (§4.5). Приводить `sheets`/`paged` к `scroll` на узком
   * экране обязан вызывающий — по `SONG_WIDE_LAYOUT_QUERY`, той же константе, что прячет
   * контролы в панели настроек.
   */
  mode?: 'scroll' | 'sheets' | 'paged';
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
  semitones = 0,
  keyPicker,
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
    reservedHeight: (mode === 'paged' ? PAGER_HEIGHT : SHEET_PADDING_TOP) + PAGE_PADDING,
  });
  const paged = usePagedFlow({ enabled: mode === 'paged', flowRef: sourceRef, pitch: sheets.pitch, totalPages: sheets.count });

  /** Тап по правой/левой трети листает, когда руки заняты инструментом (§4.4). */
  const handleFlowClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'paged') return;
    // Клик после выделения текста — не листание: выделение осталось бы потерянным.
    if (window.getSelection()?.toString()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < rect.width / 3) paged.turn(-1);
    else if (x > (rect.width * 2) / 3) paged.turn(1);
  };

  const meta = [songKey, tempo].filter(Boolean).join(' · ');
  // Когда тональность показывает селектор, в плашке она была бы дублем.
  const metaText = keyPicker ? tempo : meta;
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
      {showHeader && (title || subtitle || meta || keyPicker) && (
        <header className="song-view-header" data-song-view-header>
          {title && <h1 className="song-view-title" data-song-view-title>{title}</h1>}
          {subtitle && <p className="song-view-subtitle" data-song-view-subtitle>{subtitle}</p>}
          {(keyPicker || meta) && (
            <div className="song-view-header-row" data-song-view-header-row>
              {keyPicker}
              {/* Тональность показывает селектор, когда он есть — в плашке остаётся темп. */}
              {metaText && <span className="song-view-meta" data-song-view-meta>{metaText}</span>}
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
        onClick={mode === 'paged' ? handleFlowClick : undefined}
      >
        <div ref={sourceRef} className="cproColumn" data-song-view-flow>
          <ChordProHtmlColumn sections={sections} />
        </div>
      </div>

      {mode === 'paged' && (
        <div className="mt-3 flex items-center justify-between gap-3" data-song-view-pager>
          <button
            type="button"
            data-song-view-pager-prev
            aria-label="Предыдущая страница"
            onClick={() => paged.turn(-1)}
            disabled={paged.page <= 0}
            className="flex h-11 w-11 items-center justify-center rounded-app-sm text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
          >
            <ChevronLeft size={22} />
          </button>
          <span className="text-sm tabular-nums text-app-text-muted" data-song-view-pager-count>
            {paged.page + 1} / {sheets.count}
          </span>
          <button
            type="button"
            data-song-view-pager-next
            aria-label="Следующая страница"
            onClick={() => paged.turn(1)}
            disabled={paged.page >= sheets.count - 1}
            className="flex h-11 w-11 items-center justify-center rounded-app-sm text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}

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
