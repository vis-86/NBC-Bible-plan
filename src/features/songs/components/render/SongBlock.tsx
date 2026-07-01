'use client';

import React from 'react';
import type { SongBlock as SongBlockModel } from '../../lib/songParser';
import ChordProHtmlColumn from './ChordProHtmlColumn';

interface Props {
  block: SongBlockModel;
  /** Индекс блока (для стабильных data-хуков/классов). Необязателен вне autoscroll. */
  blockIndex?: number;
  /** Подсветка активного блока (autoscroll в источнике). В v1 не используется. */
  isActive?: boolean;
  /** Клик по блоку (autoscroll в источнике). В v1 не используется. */
  onClick?: (index: number) => void;
  lines?: string[];
  isContinuation?: boolean;
  fontSize?: number;
  hideChords?: boolean;
}

/**
 * Рендер одного логического блока песни (куплет/припев).
 *
 * Из источника убрана autoscroll-логика: интеракшн-пропы (`onClick`/`isActive`/`blockIndex`)
 * оставлены опциональными, чтобы компонент оставался совместимым, но в v1 блок статичен.
 */
export const SongBlock = React.forwardRef<HTMLDivElement, Props>(
  ({ block, blockIndex = 0, isActive = false, onClick, lines, isContinuation = false, fontSize, hideChords = false }, ref) => {
    if (!block) return null;
    const renderLines = lines ?? block.content.split('\n');

    return (
      <div
        ref={ref}
        className={`song-block song-block-${blockIndex} ${isContinuation ? 'continued' : ''} ${isActive ? 'active' : ''}`}
        onClick={onClick ? () => onClick(blockIndex) : undefined}
      >
        <div className="song-block-content">
          <div className="cproColumn" style={{ width: '100%' }}>
            <ChordProHtmlColumn
              fontSize={fontSize}
              hideChords={hideChords}
              sections={[
                {
                  comment: isContinuation ? undefined : block.comment || undefined,
                  commentType: isContinuation ? undefined : block.commentType || undefined,
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
