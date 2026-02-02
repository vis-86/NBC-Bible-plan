'use client';

import React from 'react';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { ReadingSettings as ReadingSettingsType } from '@/features/reading/types';
import { getSelfHostedTranslationOptions } from '@/lib/bible-translations';

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
  const alignOptions: Array<ReadingSettingsType['text_align']> = ['left', 'center', 'justify'];
  const themeOptions: Array<{ value: ReadingSettingsType['theme']; label: string }> = [
    { value: 'light', label: 'Светлая' },
    { value: 'dark', label: 'Темная' },
    { value: 'sepia', label: 'Сепия' }
  ];

  const otTranslationOptions = getSelfHostedTranslationOptions('ot');
  const ntTranslationOptions = getSelfHostedTranslationOptions('nt');

  const otTranslationValue =
    otTranslationOptions.some(o => o.id === settings.ot_translation)
      ? settings.ot_translation
      : (otTranslationOptions[0]?.id ?? 'rst');

  const ntTranslationValue =
    ntTranslationOptions.some(o => o.id === settings.nt_translation)
      ? settings.nt_translation
      : (ntTranslationOptions[0]?.id ?? 'rst');

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Настройки чтения">
      <div className="space-y-6">
        {/* Размер шрифта */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Размер шрифта: {settings.font_size}px
          </label>
          <input
            type="range"
            min="14"
            max="28"
            value={settings.font_size}
            onChange={(e) => {
              onSettingsChange({ ...settings, font_size: parseInt(e.target.value) });
            }}
            className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-stone-400 mt-1">
            <span>14px</span>
            <span>28px</span>
          </div>
        </div>

        {/* Межстрочный интервал */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Межстрочный интервал: {settings.line_height.toFixed(1)}
          </label>
          <input
            type="range"
            min="1.2"
            max="2.5"
            step="0.1"
            value={settings.line_height}
            onChange={(e) => {
              onSettingsChange({ ...settings, line_height: parseFloat(e.target.value) });
            }}
            className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-stone-400 mt-1">
            <span>1.2</span>
            <span>2.5</span>
          </div>
        </div>

        {/* Выравнивание текста */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Выравнивание текста
          </label>
          <div className="grid grid-cols-3 gap-2">
            {alignOptions.map((align) => (
              <button
                key={align}
                onClick={() => {
                  onSettingsChange({ ...settings, text_align: align });
                }}
                className={`px-4 py-2 rounded-lg border-2 transition-all ${
                  settings.text_align === align
                    ? 'border-red-500 bg-red-50 text-red-700 font-medium'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {align === 'left' ? 'По левому' : align === 'center' ? 'По центру' : 'По ширине'}
              </button>
            ))}
          </div>
        </div>

        {/* Тема */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Тема
          </label>
          <div className="grid grid-cols-3 gap-2">
            {themeOptions.map((theme) => (
              <button
                key={theme.value}
                onClick={() => {
                  onSettingsChange({ ...settings, theme: theme.value });
                }}
                className={`px-4 py-2 rounded-lg border-2 transition-all ${
                  settings.theme === theme.value
                    ? 'border-red-500 bg-red-50 text-red-700 font-medium'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300'
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>

        {/* Переводы */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Перевод Ветхого Завета
          </label>
          <select
            value={otTranslationValue}
            onChange={(e) => {
              onSettingsChange({
                ...settings,
                ot_translation: e.target.value as ReadingSettingsType['ot_translation']
              });
            }}
            className="w-full px-4 py-3 rounded-lg border border-stone-200 bg-white text-stone-700"
          >
            {otTranslationOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-stone-500">
            Показаны только переводы, разрешённые для хранения и выдачи через наше API.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Перевод Нового Завета
          </label>
          <select
            value={ntTranslationValue}
            onChange={(e) => {
              onSettingsChange({
                ...settings,
                nt_translation: e.target.value as ReadingSettingsType['nt_translation']
              });
            }}
            className="w-full px-4 py-3 rounded-lg border border-stone-200 bg-white text-stone-700"
          >
            {ntTranslationOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-stone-500">
            Показаны только переводы, разрешённые для хранения и выдачи через наше API.
          </p>
        </div>

        {/* Показывать номера стихов */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-stone-700">
            Показывать номера стихов
          </label>
          <button
            onClick={() => {
              onSettingsChange({ ...settings, verse_numbers_visible: !settings.verse_numbers_visible });
            }}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.verse_numbers_visible ? 'bg-red-500' : 'bg-stone-300'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                settings.verse_numbers_visible ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};

