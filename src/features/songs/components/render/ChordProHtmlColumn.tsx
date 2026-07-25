'use client';

import type React from 'react';
import './songs.css';
import { LineRenderer } from './LineRenderer';

export interface HtmlSection {
  comment?: string;
  commentType?: 'normal' | 'italic' | 'box';
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
const SectionRenderer: React.FC<{ section: HtmlSection }> = ({ section }) => {
  return (
    <span className="cproSongSection">
      {section.comment && <CommentRenderer comment={section.comment} commentType={section.commentType} />}
      {section.lines.map((line, idx) => (
        <LineRenderer key={idx} line={line} />
      ))}
    </span>
  );
};

export const ChordProHtmlColumn: React.FC<Props> = ({ sections }) => {
  return (
    <>
      {sections.map((section, i) => (
        <SectionRenderer key={i} section={section} />
      ))}
    </>
  );
};

export default ChordProHtmlColumn;
