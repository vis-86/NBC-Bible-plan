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
  fontSize?: number;
  sections: HtmlSection[];
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
  section: HtmlSection;
  fontSize?: number;
  hideChords: boolean;
}> = ({ section, fontSize, hideChords }) => {
  return (
    <span
      className="cproSongSection"
      style={{ fontSize: fontSize ? `${fontSize}px` : undefined }}
    >
      {section.comment && <CommentRenderer comment={section.comment} commentType={section.commentType} />}
      {section.lines.map((line, idx) => (
        <LineRenderer key={idx} line={line} hideChords={hideChords} fontSize={fontSize} />
      ))}
    </span>
  );
};

export const ChordProHtmlColumn: React.FC<Props> = ({ sections, fontSize, hideChords = false }) => {
  return (
    <>
      {sections.map((section, i) => (
        <SectionRenderer key={i} section={section} fontSize={fontSize} hideChords={hideChords} />
      ))}
    </>
  );
};

export default ChordProHtmlColumn;
