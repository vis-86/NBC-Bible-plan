import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface ChapterRowProps {
  text: React.ReactNode;
  onClick?: () => void;
  left?: React.ReactNode;
  textClassName?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * Унифицированная строка главы (как в дневных главах), но без обязательного чекбокса слева.
 * Для дневного списка можно передать `left` (чекбокс) и стилизовать текст через `textClassName`.
 */
export const ChapterRow: React.FC<ChapterRowProps> = ({
  text,
  onClick,
  left,
  textClassName,
  className,
  'data-testid': dataTestId,
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={[
        'flex items-center gap-3 py-2 rounded-2xl px-2 -mx-2 transition-colors',
        onClick ? 'cursor-pointer hover:bg-black/5' : '',
        className || '',
      ].join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      {left}

      <span className={['flex-1 text-base font-medium', textClassName || 'text-stone-800'].join(' ')}>
        {text}
      </span>

      <ChevronRight size={20} className="text-stone-300 flex-shrink-0" />
    </div>
  );
};

