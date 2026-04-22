'use client';

import React from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ReadingSettings as ReadingSettingsType } from '@/features/reading/types';
import { ReadingSettingsForm } from './ReadingSettingsForm';

interface ReadingSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReadingSettingsType;
  onSettingsChange: (settings: ReadingSettingsType) => void;
}

export const ReadingSettings: React.FC<ReadingSettingsProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Настройки чтения">
      <div data-reading-settings>
        <ReadingSettingsForm settings={settings} onSettingsChange={onSettingsChange} />
      </div>
    </BottomSheet>
  );
};
