'use client';

import { Pencil } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface SongInkButtonProps {
  onClick: () => void;
  /** У песни уже есть пометки — карандаш подсвечен, чтобы это было видно с листа. */
  hasAnnotations: boolean;
}

/**
 * Вход в режим рукописных пометок — слот в `SongToolStack` рядом с автоскроллом.
 * Стиль зеркалит FAB автоскролла: матовый круг, иконка цветом акцента.
 */
export function SongInkButton({ onClick, hasAnnotations }: SongInkButtonProps) {
  return (
    <button
      type="button"
      data-song-ink-open
      aria-label={hasAnnotations ? 'Пометки на песне' : 'Рисовать пометки'}
      title={hasAnnotations ? 'Пометки на песне' : 'Рисовать пометки'}
      onClick={onClick}
      className={cn(
        'pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-app-surface-elevated/70 shadow-app-card backdrop-blur-md',
        hasAnnotations ? 'text-app-accent' : 'text-app-text-secondary'
      )}
    >
      <Pencil size={20} />
    </button>
  );
}

export default SongInkButton;
