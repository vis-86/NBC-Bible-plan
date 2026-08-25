import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyChordDisplay } from './chordDisplay';
import { classifyMarker } from './markers';

/**
 * Приёмка свёртки аккордов на РЕАЛЬНОМ корпусе (как у транспозиции): проверяем, что
 * ни один маркер не потерялся и не размножился, а `bar`/`note` проходят дословно.
 */
const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'songs');
const MARKER_RE = /\[([^\]]*)\]/g;
const DISPLAYS = ['noBass', 'bassOnly'] as const;

function markersOf(text: string): string[] {
  return Array.from(text.matchAll(MARKER_RE), (match) => match[1]);
}

function fold(content: string, display: (typeof DISPLAYS)[number]): string {
  return content
    .split('\n')
    .map((line) => applyChordDisplay(line, display))
    .join('\n');
}

describe('свёртка аккордов на корпусе', () => {
  const files = readdirSync(CORPUS_DIR).filter((name) => name.endsWith('.chordpro'));

  it('корпус на месте', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(DISPLAYS)('%s: маркеры сохраняются, bar/note не меняются', (display) => {
    for (const file of files) {
      const content = readFileSync(join(CORPUS_DIR, file), 'utf-8');
      const before = markersOf(content);
      const after = markersOf(fold(content, display));

      expect(after, `${file}`).toHaveLength(before.length);

      before.forEach((raw, index) => {
        const marker = classifyMarker(raw);
        if (marker.kind !== 'chord') {
          expect(after[index], `${file} @ ${index}`).toBe(raw);
          return;
        }
        // Свёртка только укорачивает: длиннее исходного результат стать не может.
        expect(after[index].length, `${file} @ ${raw}`).toBeLessThanOrEqual(raw.length);
      });
    }
  });

  it('bassOnly оставляет слэш только там, где аккорд не распознан и прошёл дословно', () => {
    for (const file of files) {
      const content = readFileSync(join(CORPUS_DIR, file), 'utf-8');
      const before = markersOf(content);
      const after = markersOf(fold(content, 'bassOnly'));

      after.forEach((raw, index) => {
        const marker = classifyMarker(raw);
        if (marker.kind !== 'chord' || !marker.text.includes('/')) return;
        // Единственная легальная причина уцелевшего слэша — битая запись корпуса
        // (`Chord.get().empty`), которая обязана вернуться байт в байт.
        expect(raw, `${file} @ ${index}`).toBe(before[index]);
      });
    }
  });
});
