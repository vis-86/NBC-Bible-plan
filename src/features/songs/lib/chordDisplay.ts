/**
 * Свёртка аккордов при отображении: «без баса» и «только бас».
 *
 * Точка применения — сырая строка ChordPro ПОСЛЕ транспозиции: спеллинг целевой
 * тональности считается по полному аккорду, и срезать бас раньше значит потерять `B`
 * в `G/B`. Дальше идёт обычный рендер-путь, `ChordRenderer` видит обычный аккорд.
 *
 * Это отображение, а не редактирование: исходный ChordPro, поиск и персональная
 * тональность не меняются.
 */
import { Chord } from 'tonal';
import { classifyMarker } from './markers';
import { splitChordRoot } from './transpose';

/**
 * `full` — как в источнике (`G/B`), `noBass` — только часть до слэша (`G`),
 * `bassOnly` — голый корень баса без суффикса (`G/B` → `B`, `Am7` → `A`).
 */
export type SongChordDisplay = 'full' | 'noBass' | 'bassOnly';

export const SONG_CHORD_DISPLAYS: readonly SongChordDisplay[] = ['full', 'noBass', 'bassOnly'];

const MARKER_RE = /\[([^\]]*)\]/g;

/** Один аккорд цепочки. Нераспознанное — данные корпуса (`[C#mсть.]`), отдаём как есть. */
function foldSingleChord(text: string, display: Exclude<SongChordDisplay, 'full'>): string {
  if (Chord.get(text).empty) return text;

  const [root, ...rest] = text.split('/');
  if (display === 'noBass') return root;

  // Бас — то, что после слэша; без слэша нижняя нота и есть корень аккорда.
  // Многослэшевую запись (`C/G/E`) читаем по последнему элементу: ниже всех записан он.
  const bass = rest.length > 0 ? rest[rest.length - 1] : root;
  const parts = splitChordRoot(bass);
  return parts === null ? bass : parts[0];
}

/** Цепочка `E-B/D#-E/D` сворачивается поэлементно (§10.3), как и при транспозиции. */
function foldChain(text: string, display: Exclude<SongChordDisplay, 'full'>): string {
  return text
    .split('-')
    .map((part) => foldSingleChord(part, display))
    .join('-');
}

/**
 * Свёртка аккордов одной строки ChordPro. Маркеры `bar` (`[|]`) и `note` (`[(пауза)]`)
 * проходят насквозь; текст лирики не трогается.
 */
export function applyChordDisplay(line: string, display: SongChordDisplay): string {
  if (display === 'full') return line;
  return line.replace(MARKER_RE, (whole: string, inner: string) => {
    const marker = classifyMarker(inner);
    if (marker.kind !== 'chord') return whole;
    const folded = foldChain(marker.text, display);
    // Не изменился — отдаём исходный маркер дословно (сохраняем возможные пробелы внутри).
    return folded === marker.text ? whole : `[${folded}]`;
  });
}
