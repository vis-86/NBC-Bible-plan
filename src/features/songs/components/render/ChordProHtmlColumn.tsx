'use client';

import type React from 'react';
import './songs.css';
import { LineRenderer } from './LineRenderer';
import { SONG_SECTION_KIND_ATTR, type SongSectionKind } from '../../lib/songSectionKind';

export interface HtmlSection {
  comment?: string;
  commentType?: 'normal' | 'italic' | 'box';
  /** Вид секции (§3.6) — по нему CSS рисует левый рельс припева/бриджа/предприпева. */
  kind: SongSectionKind;
  lines: string[];
}

interface Props {
  sections: HtmlSection[];
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
const SectionRenderer: React.FC<{ section: HtmlSection; sectionIndex: number }> = ({ section, sectionIndex }) => {
  return (
    <span className="cproSongSection" {...{ [SONG_SECTION_KIND_ATTR]: section.kind }}>
      {section.comment && <CommentRenderer comment={section.comment} commentType={section.commentType} />}
      {section.lines.map((line, idx) => (
        // Якорь пометок — пара (индекс секции, индекс строки внутри секции), §6.
        <LineRenderer key={idx} line={line} anchor={{ section: sectionIndex, line: idx }} />
      ))}
    </span>
  );
};

export const ChordProHtmlColumn: React.FC<Props> = ({ sections }) => {
  return (
    <>
      {sections.map((section, i) => (
        <SectionRenderer key={i} section={section} sectionIndex={i} />
      ))}
    </>
  );
};

export default ChordProHtmlColumn;
