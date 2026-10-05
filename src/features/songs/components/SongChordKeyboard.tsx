'use client';

import { useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { chromaticRoots, diatonicChords } from '../lib/chordKeyboard';
import { CHORD_MODS, getChordBass, hasChordMod, type ChordMod } from '../lib/chordQuality';
import { isChordToken } from '../lib/importChordsOverLyrics';
import { splitMarkerInput } from '../lib/songEditModel';

type Panel = 'degrees' | 'chromatic' | 'bass';

export interface SongChordKeyboardProps {
  /** Нормализованная тональность песни; нет — вместо ступеней сразу хроматика. */
  songKey: string | undefined;
  /** Выбранный аккорд — ступень заменит его, модификаторы правят его на месте. */
  selectedChord: string | null;
  /** Идентичность выбора (строка, индекс, текст): смена — поле «Свой» берёт новый аккорд. */
  selectionKey: string | null;
  /** Есть куда поставить аккорд: курсор в строке или выбранный аккорд. */
  hasTarget: boolean;
  canUndo: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChord: (chord: string) => void;
  /** Группа маркеров из поля «Свой»; `focus` — индекс аккорда в группе, он станет выбранным. */
  onMarkers: (markers: string[], focus: number) => void;
  /** Знак такта или ударов: ничего не заменяет, дописывается за выбранным или в курсор. */
  onInsertMarker: (marker: string) => void;
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

/**
 * Разбор поля «Свой»: `| Am ///` → маркеры по одному. Русское H → B — только у аккордов;
 * у `(тихо)` или `x2` буква H осталась бы. Скобки запрещены: `]` закрыл бы маркер ChordPro.
 */
function parseCustom(input: string): { markers: string[]; focus: number } | null {
  if (/[[\]]/.test(input)) return null;
  const markers = splitMarkerInput(input).map((token) => {
    const asChord = token.replace(/(^|[-/])H/g, '$1B');
    return isChordToken(asChord) ? asChord : token;
  });
  if (markers.length === 0) return null;
  return { markers, focus: Math.max(0, markers.findIndex((m) => isChordToken(m))) };
}

interface CustomMarkerFormProps {
  initial: string;
  /** Правка выбранного аккорда: поле стоит в верхнем ряду дока, подтверждение — ✓. */
  replacing: boolean;
  disabled: boolean;
  onSubmit: (markers: string[], focus: number) => void;
}

/**
 * Поле «Свой». Монтируется заново на каждый выбор (`key`), поэтому начальное значение —
 * выбранный аккорд: окружить его `|` или дописать `///` — это правка текста, а не набор с нуля.
 */
function CustomMarkerForm({ initial, replacing, disabled, onSubmit }: CustomMarkerFormProps) {
  const [value, setValue] = useState(initial);
  const parsed = parseCustom(value);
  return (
    <form
      data-song-chord-keyboard-custom
      className={cn('flex min-w-0 gap-1.5', replacing ? 'flex-1' : 'mt-1.5')}
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed || disabled) return;
        onSubmit(parsed.markers, parsed.focus);
        if (!replacing) setValue('');
      }}
    >
      <input
        aria-label="Свой аккорд"
        value={value}
        placeholder="Свой: Bb/D, | Am ///, x2, (тихо)"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-11 min-w-0 flex-1 rounded-app-md border border-app-border bg-app-bg px-3 text-base text-app-text outline-none focus:border-app-primary"
      />
      <button
        type="submit"
        aria-label={replacing ? 'Заменить' : undefined}
        disabled={disabled || !parsed || (replacing && value.trim() === initial)}
        className={cn(KEY_CLASS, 'text-sm')}
      >
        {replacing ? '✓' : 'Поставить'}
      </button>
    </form>
  );
}

/**
 * Знаки, которые ставят чаще всего: тактовая черта и удары. Отдельными клавишами —
 * `|` на телефонной клавиатуре спрятан глубоко в символах.
 */
const QUICK_MARKERS = ['|', '///'] as const;

const MOD_LABELS: Record<ChordMod, string> = { m: 'm', '7': '7', maj7: 'maj7', sus4: 'sus4', sus2: 'sus2', add9: 'add9' };

/**
 * Клавиатура аккордов вместо системной (UX-модель плана M9): набрать `F#m` на русской
 * раскладке — три переключения, здесь — два тапа. Ступени тональности вынесены вперёд,
 * хроматика — за «Ещё»; такт `|` и удары `///` — первыми клавишами. Поле «Свой» (аккорд,
 * знак `x2` или группа `| Am ///`) — за «Ещё», а у выбранного аккорда оно в верхнем ряду
 * и заполнено им. Там же действия выбранного аккорда: док, а не панель над аккордом, —
 * у края экрана ей некуда было бы встать.
 */
export function SongChordKeyboard({
  songKey,
  selectedChord,
  selectionKey,
  hasTarget,
  canUndo,
  canMoveUp,
  canMoveDown,
  onChord,
  onMarkers,
  onInsertMarker,
  onToggleMod,
  onBass,
  onMove,
  onRemove,
  onUndo,
}: SongChordKeyboardProps) {
  const degrees = diatonicChords(songKey);
  const roots = chromaticRoots(songKey);
  const [panel, setPanel] = useState<Panel>(degrees ? 'degrees' : 'chromatic');
  const shownPanel: Panel = panel === 'degrees' && !degrees ? 'chromatic' : panel;
  // Тактовая черта, `(пауза)`, `x2` в цепочке — не аккорды: качества и баса у них нет,
  // `m` на `|` дал бы мусор. Заменить или убрать такой знак по-прежнему можно.
  const selectedIsChord = selectedChord !== null && isChordToken(selectedChord);
  const bass = selectedIsChord ? getChordBass(selectedChord) : '';

  const hint = selectedChord
    ? `Выбран ${selectedChord}`
    : hasTarget
      ? 'Выберите аккорд — он встанет над курсором'
      : 'Тапните по строке — курсор встанет над ней. Тап по аккорду — выбрать его';

  const handleBassMod = () => {
    if (bass) onBass('');
    else setPanel('bass');
  };

  return (
    <div data-song-chord-keyboard className="shrink-0 border-t border-app-border bg-app-surface px-3 pt-2 pb-3">
      <div className="mb-2 flex min-h-11 items-center gap-1.5">
        {/* При выборе подсказка остаётся для скринридера, а место занимает поле правки. */}
        <p data-song-chord-keyboard-hint className={selectedChord ? 'sr-only' : 'min-w-0 flex-1 text-xs text-app-text-muted'}>
          {hint}
        </p>
        {selectedChord !== null && (
          <CustomMarkerForm key={selectionKey ?? 'selected'} initial={selectedChord} replacing disabled={false} onSubmit={onMarkers} />
        )}
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
          <button type="button" data-song-chord-keyboard-undo aria-label="Отменить" onClick={onUndo} className={KEY_CLASS}>
            ↶
          </button>
        )}
      </div>

      {shownPanel === 'degrees' && degrees && (
        <div className={ROW_CLASS} data-song-chord-keyboard-degrees>
          {QUICK_MARKERS.map((marker) => (
            <button
              key={marker}
              type="button"
              data-song-chord-keyboard-quick
              aria-label={marker === '|' ? 'Тактовая черта' : 'Удары'}
              disabled={!hasTarget}
              onClick={() => onInsertMarker(marker)}
              className={KEY_CLASS}
            >
              {marker}
            </button>
          ))}
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
            {QUICK_MARKERS.map((marker) => (
              <button
                key={marker}
                type="button"
                data-song-chord-keyboard-quick
                aria-label={marker === '|' ? 'Тактовая черта' : 'Удары'}
                disabled={!hasTarget}
                onClick={() => onInsertMarker(marker)}
                className={KEY_CLASS}
              >
                {marker}
              </button>
            ))}
            {roots.map((root) => (
              <button key={root} type="button" disabled={!hasTarget} onClick={() => onChord(root)} className={KEY_CLASS}>
                {root}
              </button>
            ))}
          </div>
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

      {selectedChord === null && shownPanel === 'chromatic' && (
        <CustomMarkerForm initial="" replacing={false} disabled={!hasTarget} onSubmit={onMarkers} />
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
