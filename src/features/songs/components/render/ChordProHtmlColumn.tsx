'use client';

import type React from 'react';
import './songs.css';
import { LineRenderer } from './LineRenderer';
import { SONG_SECTION_KIND_ATTR, type SongSectionKind } from '../../lib/songSectionKind';
import { groupSongLinePairs } from '../../lib/songLinePairs';

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
      {/* Строки завёрнуты парами (см. `groupSongLinePairs`). Обёртка есть ВСЕГДА, но
          вне режима склейки она `display: contents` — раскладка ровно прежняя. Индекс
          строки берётся из группы, а не из позиции внутри неё: якорь пометок обязан
          остаться исходным, иначе штрихи уедут на чужие строки. */}
      {groupSongLinePairs(section.lines).map((pair, pairIdx) => (
        <span className="cproSongLinePair" key={pairIdx}>
          {pair.map((lineIdx) => (
            // Якорь пометок — пара (индекс секции, индекс строки внутри секции), §6.
            <LineRenderer key={lineIdx} line={section.lines[lineIdx]} anchor={{ section: sectionIndex, line: lineIdx }} />
          ))}
        </span>
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
