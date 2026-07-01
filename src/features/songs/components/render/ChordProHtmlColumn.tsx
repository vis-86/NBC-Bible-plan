'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import './songs.css';
import { LineRenderer } from './LineRenderer';
import { TableLineRenderer } from './TableLineRenderer';

export interface HtmlSection {
  comment?: string;
  commentType?: 'normal' | 'italic' | 'box';
  lines: string[];
  meta?: {
    blockIndex: number;
    isContinuation: boolean;
    measuredHeight?: number;
    gapBefore?: number;
    headerHeight?: number;
  };
}

interface Props {
  fontSize?: number;
  sections: HtmlSection[];
  showDebugHeights?: boolean;
  renderMode?: 'inline' | 'table' | 'auto';
  /**
   * Скрыть аккорды (режим «только текст»). Раньше бралось из zustand `useSettingsStore`;
   * теперь прокидывается пропом сверху (SongView → SongBlock → сюда).
   */
  hideChords?: boolean;
}

/**
 * Компонент для рендеринга комментария секции
 */
const CommentRenderer: React.FC<{ comment: string; commentType?: 'normal' | 'italic' | 'box' }> = ({ comment, commentType }) => {
  const className = `cproComment ${commentType === 'italic' ? 'cproCommentItalic' : commentType === 'box' ? 'cproCommentBox' : ''}`.trim();

  return <span className={className}>{comment}</span>;
};

/**
 * Компонент для рендеринга секции песни
 */
const SectionRenderer: React.FC<{
  section: HtmlSection & { renderMode?: 'inline' | 'table' | 'auto' };
  fontSize?: number;
  hideChords: boolean;
  showDebugHeights?: boolean;
  sectionRef: (el: HTMLSpanElement | null) => void;
  sectionHeight?: number;
}> = ({ section, fontSize, hideChords, showDebugHeights, sectionRef, sectionHeight }) => {
  return (
    <span
      ref={sectionRef}
      className="cproSongSection"
      style={{
        fontSize: fontSize ? `${fontSize}px` : undefined,
        position: showDebugHeights ? 'relative' : undefined,
        display: showDebugHeights ? 'block' : undefined,
      }}
      data-block-index={section.meta?.blockIndex}
      data-block-continuation={section.meta?.isContinuation ? '1' : '0'}
      data-block-measured-height={section.meta?.measuredHeight ?? undefined}
      data-block-gap={section.meta?.gapBefore ?? undefined}
      data-block-header-height={section.meta?.headerHeight ?? undefined}
    >
      {section.comment && <CommentRenderer comment={section.comment} commentType={section.commentType} />}
      {section.lines.map((line, idx) => {
        // Если renderMode === 'table', всегда используем табличный режим
        // Если renderMode === 'inline', всегда используем inline режим
        // Если renderMode === 'auto', выбираем автоматически
        const currentRenderMode = section.renderMode || 'auto';
        let useTable: boolean;

        if (currentRenderMode === 'table') {
          useTable = true;
        } else if (currentRenderMode === 'inline') {
          useTable = false;
        } else {
          // auto mode - используем эвристику
          useTable = shouldUseTableMode(line);
        }

        // ВАЖНО: При renderMode === 'table' ВСЕГДА используем TableLineRenderer
        // даже если он возвращает null (для пустых строк)
        return useTable ? (
          <TableLineRenderer key={idx} line={line} hideChords={hideChords} fontSize={fontSize} />
        ) : (
          <LineRenderer key={idx} line={line} hideChords={hideChords} fontSize={fontSize} />
        );
      })}
      {showDebugHeights && sectionHeight !== undefined && (
        <span
          style={{
            position: 'absolute',
            right: 4,
            bottom: 2,
            color: 'var(--app-text-muted)',
            fontSize: '10px',
            background: 'var(--app-surface-muted)',
            padding: '0 3px',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        >
          {sectionHeight}px
        </span>
      )}
    </span>
  );
};

/**
 * Определяет, нужно ли использовать табличный режим для строки
 * Используется когда аккорды не накладываются друг на друга
 */
function shouldUseTableMode(line: string): boolean {
  // Простая эвристика: если в строке есть аккорды и они не слишком близко друг к другу
  const chordMatches = line.match(/\[[^\]]+\]/g);
  if (!chordMatches || chordMatches.length < 2) return false;

  // Проверяем расстояние между аккордами
  let lastChordEnd = -1;
  for (const match of chordMatches) {
    const chordStart = line.indexOf(match, lastChordEnd + 1);
    if (chordStart === -1) continue;

    if (lastChordEnd >= 0 && chordStart - lastChordEnd < 3) {
      // Аккорды слишком близко - используем inline режим
      return false;
    }

    lastChordEnd = chordStart + match.length;
  }

  return true;
}

export const ChordProHtmlColumn: React.FC<Props> = ({ sections, fontSize, showDebugHeights, renderMode = 'inline', hideChords = false }) => {
  const sectionRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [sectionHeights, setSectionHeights] = useState<number[]>([]);

  useEffect(() => {
    if (!showDebugHeights) return;
    const measure = () => {
      const h = sectionRefs.current.map((el) => el?.offsetHeight || 0);
      setSectionHeights(h);
    };
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sections, fontSize, showDebugHeights]);

  return (
    <>
      {sections.map((section, i) => (
        <SectionRenderer
          key={i}
          section={{ ...section, renderMode }}
          fontSize={fontSize}
          hideChords={hideChords}
          showDebugHeights={showDebugHeights}
          sectionRef={(el) => {
            sectionRefs.current[i] = el;
          }}
          sectionHeight={sectionHeights[i]}
        />
      ))}
    </>
  );
};

export default ChordProHtmlColumn;
