'use client';

import React from 'react';
import { ReadingSettings as ReadingSettingsType } from '@/features/reading/types';
import { getSelfHostedTranslationOptions } from '@/lib/bible-translations';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';

export interface ReadingSettingsFormProps {
  settings: ReadingSettingsType;
  onSettingsChange: (settings: ReadingSettingsType) => void;
  className?: string;
  disabled?: boolean;
}

export function ReadingSettingsForm({
  settings,
  onSettingsChange,
  className = '',
  disabled = false
}: ReadingSettingsFormProps) {
  const alignOptions: Array<ReadingSettingsType['text_align']> = ['left', 'center', 'justify'];
  const themeOptions: Array<{ value: ReadingSettingsType['theme']; label: string }> = [
    { value: 'light', label: 'Светлая' },
    { value: 'dark', label: 'Тёмная' },
    { value: 'sepia', label: 'Сепия' },
    { value: 'system', label: 'Как в системе' }
  ];

  const otTranslationOptions = getSelfHostedTranslationOptions('ot');
  const ntTranslationOptions = getSelfHostedTranslationOptions('nt');

  const otTranslationValue = otTranslationOptions.some(o => o.id === settings.ot_translation)
    ? settings.ot_translation
    : (otTranslationOptions[0]?.id ?? 'rst');

  const ntTranslationValue = ntTranslationOptions.some(o => o.id === settings.nt_translation)
    ? settings.nt_translation
    : (ntTranslationOptions[0]?.id ?? 'rst');

  return (
    <div
      data-reading-settings-form
      className={`space-y-6 ${className}`.trim()}
    >
      <div data-section="font-size">
        <label className="mb-2 block text-sm font-medium text-app-text-secondary">
          Размер шрифта: {settings.font_size}px
        </label>
        <input
          type="range"
          min="14"
          max="28"
          value={settings.font_size}
          disabled={disabled}
          onChange={(e) => {
            onSettingsChange({ ...settings, font_size: parseInt(e.target.value, 10) });
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
        />
        <div className="mt-1 flex justify-between text-xs text-app-text-muted">
          <span>14px</span>
          <span>28px</span>
        </div>
      </div>

      <div data-section="line-height">
        <label className="mb-2 block text-sm font-medium text-app-text-secondary">
          Межстрочный интервал: {settings.line_height.toFixed(1)}
        </label>
        <input
          type="range"
          min="1.2"
          max="2.5"
          step="0.1"
          value={settings.line_height}
          disabled={disabled}
          onChange={(e) => {
            onSettingsChange({ ...settings, line_height: parseFloat(e.target.value) });
          }}
          className="h-2 w-full cursor-pointer appearance-none rounded-app-sm bg-app-surface-muted accent-app-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
        />
        <div className="mt-1 flex justify-between text-xs text-app-text-muted">
          <span>1.2</span>
          <span>2.5</span>
        </div>
      </div>

      <div data-section="text-align">
        <label className="mb-2 block text-sm font-medium text-app-text-secondary">
          Выравнивание текста
        </label>
        <ChoiceGroup
          options={alignOptions}
          value={settings.text_align}
          onChange={(align) => onSettingsChange({ ...settings, text_align: align })}
          labelFor={(align) => (align === 'left' ? 'По левому' : align === 'center' ? 'По центру' : 'По ширине')}
          disabled={disabled}
          columns={3}
        />
      </div>

      <div data-section="reader-theme">
        <label className="mb-2 block text-sm font-medium text-app-text-secondary">
          Тема текста при чтении
        </label>
        <ChoiceGroup
          options={themeOptions.map((t) => t.value)}
          value={settings.theme}
          onChange={(value) => onSettingsChange({ ...settings, theme: value })}
          labelFor={(value) => themeOptions.find((t) => t.value === value)?.label ?? value}
          disabled={disabled}
          columns={2}
        />
      </div>

      <fieldset disabled={disabled} className="space-y-2" data-section="ot-translation">
        <legend className="mb-2 block text-sm font-medium text-app-text-secondary">
          Перевод Ветхого Завета
        </legend>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Перевод Ветхого Завета">
          {otTranslationOptions.map(opt => {
            const inputId = `reading-ot-${opt.id}`;
            const checked = otTranslationValue === opt.id;
            return (
              <label
                key={opt.id}
                htmlFor={inputId}
                className={`flex cursor-pointer items-center gap-3 rounded-app-md border-2 px-3 py-2.5 transition-all has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                  checked
                    ? 'border-app-primary bg-app-primary-light'
                    : 'border-app-border hover:border-app-border-strong'
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="reading-ot-translation"
                  value={opt.id}
                  checked={checked}
                  onChange={() => {
                    onSettingsChange({
                      ...settings,
                      ot_translation: opt.id as ReadingSettingsType['ot_translation']
                    });
                  }}
                  className="h-4 w-4 shrink-0 accent-app-primary"
                />
                <span
                  className={`text-sm ${
                    checked ? 'font-medium text-app-primary' : 'text-app-text'
                  }`}
                >
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-app-text-muted">
          Показаны только переводы, разрешённые для хранения и выдачи через наше API.
        </p>
      </fieldset>

      <fieldset disabled={disabled} className="space-y-2" data-section="nt-translation">
        <legend className="mb-2 block text-sm font-medium text-app-text-secondary">
          Перевод Нового Завета
        </legend>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Перевод Нового Завета">
          {ntTranslationOptions.map(opt => {
            const inputId = `reading-nt-${opt.id}`;
            const checked = ntTranslationValue === opt.id;
            return (
              <label
                key={opt.id}
                htmlFor={inputId}
                className={`flex cursor-pointer items-center gap-3 rounded-app-md border-2 px-3 py-2.5 transition-all has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${
                  checked
                    ? 'border-app-primary bg-app-primary-light'
                    : 'border-app-border hover:border-app-border-strong'
                }`}
              >
                <input
                  id={inputId}
                  type="radio"
                  name="reading-nt-translation"
                  value={opt.id}
                  checked={checked}
                  onChange={() => {
                    onSettingsChange({
                      ...settings,
                      nt_translation: opt.id as ReadingSettingsType['nt_translation']
                    });
                  }}
                  className="h-4 w-4 shrink-0 accent-app-primary"
                />
                <span
                  className={`text-sm ${
                    checked ? 'font-medium text-app-primary' : 'text-app-text'
                  }`}
                >
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-app-text-muted">
          Показаны только переводы, разрешённые для хранения и выдачи через наше API.
        </p>
      </fieldset>

      <div className="flex items-center justify-between" data-section="verse-numbers">
        <label className="text-sm font-medium text-app-text-secondary">
          Показывать номера стихов
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.verse_numbers_visible}
          aria-label="Показывать номера стихов"
          disabled={disabled}
          onClick={() => {
            onSettingsChange({ ...settings, verse_numbers_visible: !settings.verse_numbers_visible });
          }}
          className="relative flex h-11 w-14 -mr-1 items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
        >
          <span
            aria-hidden
            className={`relative h-6 w-12 rounded-full transition-colors ${
              settings.verse_numbers_visible ? 'bg-app-primary' : 'bg-app-surface-muted'
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform dark:ring-white/10 ${
                settings.verse_numbers_visible ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between" data-section="verse-per-line">
        <label className="text-sm font-medium text-app-text-secondary">
          Каждый стих с новой строки
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.verse_per_line}
          aria-label="Каждый стих с новой строки"
          disabled={disabled}
          onClick={() => {
            onSettingsChange({ ...settings, verse_per_line: !settings.verse_per_line });
          }}
          className="relative flex h-11 w-14 -mr-1 items-center justify-center rounded-full disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary"
        >
          <span
            aria-hidden
            className={`relative h-6 w-12 rounded-full transition-colors ${
              settings.verse_per_line ? 'bg-app-primary' : 'bg-app-surface-muted'
            }`}
          >
            <span
              className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform dark:ring-white/10 ${
                settings.verse_per_line ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
