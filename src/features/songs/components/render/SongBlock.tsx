'use client';

import React from 'react';
import type { SongBlock as SongBlockModel } from '../../lib/songParser';
import ChordProHtmlColumn from './ChordProHtmlColumn';

interface Props {
  block: SongBlockModel;
  /** Индекс блока (для стабильных data-хуков/классов). */
  blockIndex?: number;
  lines?: string[];
  fontSize?: number;
  hideChords?: boolean;
}

/**
 * Рендер одного логического блока песни (куплет/припев). В v1 блок статичен —
 * autoscroll-логика источника (onClick/isActive/isContinuation) не портирована.
 */
export const SongBlock = React.forwardRef<HTMLDivElement, Props>(
  ({ block, blockIndex = 0, lines, fontSize, hideChords = false }, ref) => {
    if (!block) return null;
    const renderLines = lines ?? block.content.split('\n');

    return (
      <div ref={ref} className={`song-block song-block-${blockIndex}`}>
        <div className="song-block-content">
          <div className="cproColumn" style={{ width: '100%' }}>
            <ChordProHtmlColumn
              fontSize={fontSize}
              hideChords={hideChords}
              sections={[
                {
                  comment: block.comment || undefined,
                  commentType: block.commentType || undefined,
                  lines: renderLines,
                },
              ]}
            />
          </div>
        </div>
      </div>
    );
  },
);

SongBlock.displayName = 'SongBlock';

export default SongBlock;
