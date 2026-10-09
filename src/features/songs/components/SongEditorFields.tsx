'use client';

import { cn } from '@/shared/utils/cn';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';
import type { SongVisibility } from '../types';
import type { SongEditorDraft, SongEditorErrors } from '../lib/songEditorDraft';

// text-base (16px), а не text-sm: iOS зумит страницу при фокусе поля мельче 16px.
export const SONG_EDITOR_INPUT_CLASS =
  'w-full min-w-0 rounded-app-md border bg-app-surface px-3 py-2.5 text-base text-app-text outline-none transition-colors focus:border-app-primary';

export interface SongEditorFieldsProps {
  draft: SongEditorDraft;
  errors: SongEditorErrors;
  onChange: (patch: Partial<SongEditorDraft>) => void;
  disabled?: boolean;
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
  disabled?: boolean;
  onChange: (value: string) => void;
}

function Field({ id, label, value, error, placeholder, inputMode = 'text', disabled, onChange }: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-app-text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(SONG_EDITOR_INPUT_CLASS, error ? 'border-app-missed-text' : 'border-app-border')}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-app-missed-text">
          {error}
        </p>
      )}
    </div>
  );
}

const VISIBILITY_LABELS: Record<SongVisibility, string> = {
  public: 'Открыта всем',
  members: 'Только своим',
};

/** Метаданные песни. `subtitle` и `defaultKey` намеренно не показаны — шум для редактора. */
export function SongEditorFields({ draft, errors, onChange, disabled }: SongEditorFieldsProps) {
  return (
    <div data-song-editor-fields className="space-y-3">
      <Field
        id="song-editor-title"
        label="Название"
        value={draft.title}
        error={errors.title}
        placeholder="Название песни"
        disabled={disabled}
        onChange={(title) => onChange({ title })}
      />
      <div className="grid grid-cols-3 gap-3">
        <Field
          id="song-editor-key"
          label="Тональность"
          value={draft.key}
          error={errors.key}
          placeholder="Am"
          disabled={disabled}
          onChange={(key) => onChange({ key })}
        />
        <Field
          id="song-editor-tempo"
          label="Темп"
          value={draft.tempo}
          error={errors.tempo}
          placeholder="72"
          inputMode="numeric"
          disabled={disabled}
          onChange={(tempo) => onChange({ tempo })}
        />
        <Field
          id="song-editor-time"
          label="Размер"
          value={draft.time}
          error={errors.time}
          placeholder="4/4"
          disabled={disabled}
          onChange={(time) => onChange({ time })}
        />
      </div>
      <div data-song-editor-visibility>
        <p id="song-editor-visibility-label" className="mb-1.5 text-sm font-medium text-app-text-secondary">
          Ссылка «Поделиться»
        </p>
        <ChoiceGroup<SongVisibility>
          options={['public', 'members'] as const}
          value={draft.visibility}
          onChange={(visibility) => onChange({ visibility })}
          labelFor={(option) => VISIBILITY_LABELS[option]}
          columns={2}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
