'use client';

import type React from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';

export interface SongFontSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
}

/**
 * Настройка размера шрифта просмотра песни (лирика + аккорды масштабируются
 * пропорционально, см. `render/songs.css`). Разметка слайдера — по образцу
 * секции font-size в `ReadingSettingsForm`.
 */
export const SongFontSettings: React.FC<SongFontSettingsProps> = ({
  isOpen,
  onClose,
  fontSize,
  onFontSizeChange,
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Настройки шрифта">
      <div data-song-font-settings>
        <label className="mb-2 block text-sm font-medium text-app-text-secondary">
          Размер шрифта: {fontSize}px
        </label>
        <input
          type="range"
          min="14"
          max="28"
          value={fontSize}
          data-song-font-settings-slider
          onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
          className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
        />
        <div className="mt-1 flex justify-between text-xs text-app-text-muted">
          <span>14px</span>
          <span>28px</span>
        </div>
      </div>
    </BottomSheet>
  );
};
