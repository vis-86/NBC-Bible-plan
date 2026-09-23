'use client';

import { useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { chromaticRoots, diatonicChords } from '../lib/chordKeyboard';
import { CHORD_MODS, getChordBass, hasChordMod, type ChordMod } from '../lib/chordQuality';
import { isChordToken } from '../lib/importChordsOverLyrics';

type Panel = 'degrees' | 'chromatic' | 'bass';

export interface SongChordKeyboardProps {
  /** Нормализованная тональность песни; нет — вместо ступеней сразу хроматика. */
  songKey: string | undefined;
  /** Выбранный аккорд — ступень заменит его, модификаторы правят его на месте. */
  selectedChord: string | null;
  /** Есть куда поставить аккорд: курсор в строке или выбранный аккорд. */
  hasTarget: boolean;
  canUndo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChord: (chord: string) => void;
  onToggleMod: (mod: ChordMod) => void;
  onBass: (bass: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onUndo: () => void;
}

const KEY_CLASS =
  'flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-app-md border border-app-border bg-app-surface px-2.5 text-base font-semibold text-app-text transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
const MOD_CLASS =
  'flex min-h-11 shrink-0 items-center justify-center rounded-app-md border-2 px-3 text-sm font-medium transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
const ROW_CLASS = 'flex gap-1.5 overflow-x-auto pb-1';

const MOD_LABELS: Record<ChordMod, string> = { m: 'm', '7': '7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2', add9: 'add9' };

/**
 * Клавиатура аккордов вместо системной (UX-модель плана M9): набрать `F#m` на русской
 * раскладке — три переключения, здесь — два тапа. Ступени тональности вынесены вперёд,
 * хроматика и свой аккорд — за «Ещё». Над клавиатурой — действия выбранного аккорда:
 * док, а не панель над аккордом, — у края экрана ей некуда было бы встать.
 */
export function SongChordKeyboard({
  songKey,
  selectedChord,
  hasTarget,
  canUndo,
  canMoveUp,
  canMoveDown,
  onChord,
  onToggleMod,
  onBass,
  onMove,
  onRemove,
  onUndo,
}: SongChordKeyboardProps) {
  const degrees = diatonicChords(songKey);
  const roots = chromaticRoots(songKey);
  const [panel, setPanel] = useState<Panel>(degrees ? 'degrees' : 'chromatic');
  const [custom, setCustom] = useState('');
  const shownPanel: Panel = panel === 'degrees' && !degrees ? 'chromatic' : panel;
  // Тактовая черта, `(пауза)`, `x2` в цепочке — не аккорды: качества и баса у них нет,
  // `m` на `|` дал бы мусор. Заменить или убрать такой знак по-прежнему можно.
  const selectedIsChord = selectedChord !== null && isChordToken(selectedChord);
  const bass = selectedIsChord ? getChordBass(selectedChord) : '';
  // Русское H однозначно значит си — внутри песни английская нотация (см. chordQuality.ts).
  const customChord = custom.trim().replace(/(^|[-/])H/g, '$1B');
  const customValid = isChordToken(customChord);

  const hint = selectedChord
    ? `Выбран ${selectedChord}`
    : hasTarget
      ? 'Выберите аккорд — он встанет над курсором'
      : 'Тапните по строке — курсор встанет над ней. Тап по аккорду — выбрать его';

  const handleBassMod = () => {
    if (bass) onBass('');
    else setPanel('bass');
  };

  const submitCustom = () => {
    if (!customValid) return;
    onChord(customChord);
    setCustom('');
  };

  return (
    <div data-song-chord-keyboard className="shrink-0 border-t border-app-border bg-app-surface px-3 pt-2 pb-3">
      <div className="mb-2 flex min-h-11 items-center gap-1.5">
        <p data-song-chord-keyboard-hint className="min-w-0 flex-1 text-xs text-app-text-muted">
          {hint}
        </p>
        {selectedChord && (
          <>
            <button type="button" aria-label="Перенести строкой выше" disabled={!canMoveUp} onClick={() => onMove(-1)} className={KEY_CLASS}>
              ↑
            </button>
            <button type="button" aria-label="Перенести строкой ниже" disabled={!canMoveDown} onClick={() => onMove(1)} className={KEY_CLASS}>
              ↓
            </button>
            <button type="button" aria-label="Убрать аккорд" onClick={onRemove} className={KEY_CLASS}>
              ⌫
            </button>
          </>
        )}
        {canUndo && (
          <button type="button" data-song-chord-keyboard-undo onClick={onUndo} className={cn(KEY_CLASS, 'text-sm font-medium')}>
            Отменить
          </button>
        )}
      </div>

      {shownPanel === 'degrees' && degrees && (
        <div className={ROW_CLASS} data-song-chord-keyboard-degrees>
          {degrees.map(({ chord, degree }) => (
            <button key={degree} type="button" disabled={!hasTarget} onClick={() => onChord(chord)} className={KEY_CLASS}>
              <span>{chord}</span>
              <span className="text-[10px] font-normal text-app-text-muted">{degree}</span>
            </button>
          ))}
          <button type="button" onClick={() => setPanel('chromatic')} className={cn(KEY_CLASS, 'text-sm')}>
            Ещё
          </button>
        </div>
      )}

      {shownPanel === 'chromatic' && (
        <div className="space-y-1.5" data-song-chord-keyboard-chromatic>
          <div className={ROW_CLASS}>
            {degrees && (
              <button type="button" onClick={() => setPanel('degrees')} className={cn(KEY_CLASS, 'text-sm')}>
                Ступени
              </button>
            )}
            {roots.map((root) => (
              <button key={root} type="button" disabled={!hasTarget} onClick={() => onChord(root)} className={KEY_CLASS}>
                {root}
              </button>
            ))}
          </div>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              submitCustom();
            }}
          >
            <input
              aria-label="Свой аккорд"
              value={custom}
              placeholder="Свой: Bb/D, Cdim…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCustom(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-app-md border border-app-border bg-app-bg px-3 text-base text-app-text outline-none focus:border-app-primary"
            />
            <button type="submit" disabled={!hasTarget || !customValid} className={cn(KEY_CLASS, 'text-sm')}>
              Поставить
            </button>
          </form>
        </div>
      )}

      {shownPanel === 'bass' && (
        <div className={ROW_CLASS} data-song-chord-keyboard-bass>
          <button type="button" onClick={() => setPanel(degrees ? 'degrees' : 'chromatic')} className={cn(KEY_CLASS, 'text-sm')}>
            Отмена
          </button>
          {roots.map((root) => (
            <button
              key={root}
              type="button"
              disabled={!selectedChord}
              onClick={() => {
                onBass(root);
                setPanel(degrees ? 'degrees' : 'chromatic');
              }}
              className={KEY_CLASS}
            >
              /{root}
            </button>
          ))}
        </div>
      )}

      <div className={cn(ROW_CLASS, 'mt-1.5')} data-song-chord-keyboard-mods>
        {CHORD_MODS.map((mod) => {
          const on = selectedIsChord ? hasChordMod(selectedChord, mod) : false;
          return (
            <button
              key={mod}
              type="button"
              aria-pressed={on}
              disabled={!selectedIsChord}
              onClick={() => onToggleMod(mod)}
              className={cn(MOD_CLASS, on ? 'border-app-primary bg-app-primary-light text-app-primary' : 'border-app-border text-app-text-secondary')}
            >
              {MOD_LABELS[mod]}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={Boolean(bass)}
          disabled={!selectedIsChord}
          onClick={handleBassMod}
          className={cn(MOD_CLASS, bass ? 'border-app-primary bg-app-primary-light text-app-primary' : 'border-app-border text-app-text-secondary')}
        >
          {bass ? `/${bass}` : '/бас'}
        </button>
      </div>
    </div>
  );
}
