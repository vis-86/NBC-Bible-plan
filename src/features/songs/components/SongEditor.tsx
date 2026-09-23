'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ChoiceGroup } from '@/shared/components/ui/ChoiceGroup';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { cn } from '@/shared/utils/cn';
import { useSaveSong } from '../hooks/useSaveSong';
import {
  applyPastedText,
  hasSongDraftErrors,
  normalizeSongKey,
  toCreateSongPayload,
  toUpdateSongPayload,
  validateSongDraft,
  type PasteNotation,
  type PasteState,
  type SongEditorDraft,
} from '../lib/songEditorDraft';
import type { ImportedSong } from '../lib/importChordsOverLyrics';
import { SONG_EDITOR_INPUT_CLASS, SongEditorFields } from './SongEditorFields';
import { SongView } from './SongView';

type EditorTab = 'paste' | 'source';

const TAB_LABELS: Record<EditorTab, string> = { paste: 'Вставить', source: 'Исходник' };
const NOTATION_LABELS: Record<PasteNotation, string> = { auto: 'Авто', ru: 'H = си', en: 'B = си' };

// wrap="off": «аккорды над строкой» держатся на моноширинных колонках — перенос строки
// в поле ломает выравнивание прямо на глазах у человека, который его вставил.
const MONO_AREA_CLASS = cn(SONG_EDITOR_INPUT_CLASS, 'min-h-64 resize-y whitespace-pre font-mono text-sm leading-relaxed');

export interface SongEditorProps {
  /** `null` — создание новой песни. */
  songId: string | null;
  initial: SongEditorDraft;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

function importSummary(imported: ImportedSong): string {
  const notation = imported.notation === 'ru' ? 'русская нотация (H = си)' : 'английская нотация (B = си)';
  const { sections, chords } = imported.stats;
  return `Разобрано: секций ${sections}, аккордов ${chords}; ${notation}.`;
}

/**
 * Редактор песни, шаг T3a плана M9: метаданные, вставка «аккорды над строкой» и
 * ChordPro-исходник, предпросмотр тем же `SongView`, что и на экране песни. Холст
 * расстановки аккордов — следующий шаг (T3b), сюда он встанет третьей вкладкой.
 *
 * Запись online-only (решение 4): без сети кнопка неактивна и видна причина.
 */
export function SongEditor({ songId, initial, onSaved, onCancel }: SongEditorProps) {
  const isNew = songId === null;
  const isOnline = useIsOnline();
  const { create, update, submitting, error } = useSaveSong();

  const [draft, setDraft] = useState<SongEditorDraft>(initial);
  const [tab, setTab] = useState<EditorTab>(isNew ? 'paste' : 'source');
  const [paste, setPaste] = useState<PasteState>({ raw: '', notation: 'auto', titleIsAuto: false, baseContent: '' });
  const [imported, setImported] = useState<ImportedSong | null>(null);
  // Ошибки полей показываем после первой попытки сохранить — не кричим на пустую форму.
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateSongDraft(draft), [draft]);
  const patch = useMemo(() => (isNew ? null : toUpdateSongPayload(initial, draft)), [isNew, initial, draft]);
  const dirty = isNew ? Object.values(draft).some((v) => v.trim() !== '') : patch !== null;
  const canSave = isOnline && !submitting && dirty;

  // Предпросмотр парсит песню целиком — на длинной вставке пусть отстаёт от ввода, а не тормозит его.
  const previewContent = useDeferredValue(draft.content);
  const previewKey = normalizeSongKey(draft.key) || undefined;

  const updateDraft = (next: Partial<SongEditorDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
    // Название, исправленное руками, вставка больше не трогает.
    if (next.title !== undefined) setPaste((prev) => ({ ...prev, titleIsAuto: false }));
  };

  const runPaste = (nextPaste: PasteState, raw: string) => {
    const result = applyPastedText(draft, nextPaste, raw);
    setDraft(result.draft);
    setPaste(result.paste);
    setImported(result.imported);
  };

  const handleSave = async () => {
    setShowErrors(true);
    if (hasSongDraftErrors(errors)) {
      console.debug('[SongEditor] save blocked by validation', Object.keys(errors));
      return;
    }
    let savedId: string | null;
    if (isNew) savedId = await create(toCreateSongPayload(draft));
    else if (patch) savedId = await update(songId, patch);
    else return;
    if (savedId) onSaved(savedId);
  };

  const handleCancel = () => {
    if (dirty && !window.confirm('Выйти без сохранения? Изменения пропадут.')) return;
    onCancel();
  };

  const visibleErrors = showErrors ? errors : {};

  return (
    <div data-song-editor className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={isNew ? 'Новая песня' : 'Правка песни'}
        onBack={handleCancel}
        backAriaLabel="Выйти из редактора"
        right={
          <button
            type="button"
            data-song-editor-save
            disabled={!canSave}
            onClick={handleSave}
            className="rounded-app-md bg-app-primary px-4 py-2 text-sm font-semibold text-app-text-inverse transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <div className="mx-auto max-w-2xl space-y-5">
          {!isOnline && (
            <p role="alert" data-song-editor-offline className="text-sm text-app-missed-text">
              Нужен интернет, чтобы сохранить песню.
            </p>
          )}
          {error && (
            <p role="alert" data-song-editor-error className="text-sm text-app-missed-text">
              {error}
            </p>
          )}

          <SongEditorFields draft={draft} errors={visibleErrors} onChange={updateDraft} disabled={submitting} />

          <div className="space-y-3">
            <ChoiceGroup
              options={['paste', 'source'] as const}
              value={tab}
              onChange={setTab}
              labelFor={(t) => TAB_LABELS[t]}
              columns={2}
            />

            {tab === 'paste' ? (
              <div data-song-editor-paste className="space-y-3">
                <p className="text-sm text-app-text-muted">
                  Вставьте песню «аккорды над строкой» — с сайта или из заметок. Приложение разберёт её само.
                  {!isNew && ' Вставка заменит весь текст песни.'}
                </p>
                <textarea
                  aria-label="Текст песни с аккордами над строкой"
                  data-song-editor-paste-input
                  value={paste.raw}
                  wrap="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  disabled={submitting}
                  onChange={(e) => runPaste(paste, e.target.value)}
                  className={cn(MONO_AREA_CLASS, 'border-app-border')}
                />
                <div>
                  <p className="mb-2 text-sm font-medium text-app-text-secondary">Нотация аккордов</p>
                  <ChoiceGroup
                    options={['auto', 'ru', 'en'] as const}
                    value={paste.notation}
                    onChange={(notation) => runPaste({ ...paste, notation }, paste.raw)}
                    labelFor={(n) => NOTATION_LABELS[n]}
                    columns={3}
                    disabled={submitting}
                  />
                </div>
                {imported && (
                  <p data-song-editor-paste-summary className="text-sm text-app-text-muted">
                    {importSummary(imported)}
                    {imported.title && ` Первая строка «${imported.title}» принята за название.`}
                  </p>
                )}
              </div>
            ) : (
              <div data-song-editor-source className="space-y-2">
                <p className="text-sm text-app-text-muted">
                  Формат хранения — ChordPro: аккорд в квадратных скобках перед слогом, секция — {'{comment: Куплет}'}.
                </p>
                <textarea
                  aria-label="Исходник песни в ChordPro"
                  data-song-editor-source-input
                  value={draft.content}
                  wrap="off"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  disabled={submitting}
                  onChange={(e) => updateDraft({ content: e.target.value })}
                  className={cn(MONO_AREA_CLASS, visibleErrors.content ? 'border-app-missed-text' : 'border-app-border')}
                />
              </div>
            )}
            {visibleErrors.content && <p className="text-sm text-app-missed-text">{visibleErrors.content}</p>}
          </div>

          <section data-song-editor-preview aria-label="Предпросмотр" className="border-t border-app-border pt-5">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">
              Как будет выглядеть
            </h2>
            {previewContent.trim() ? (
              <SongView content={previewContent} songKey={previewKey} showHeader={false} />
            ) : (
              <p className="text-sm text-app-text-muted">Здесь появится песня, когда вы добавите текст.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
