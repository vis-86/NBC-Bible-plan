import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Note } from 'tonal';
import { describe, expect, it } from 'vitest';
import { classifyMarker } from './markers';
import { transposeLine } from './transpose';

/**
 * Приёмка транспозиции на РЕАЛЬНОМ корпусе (§12), а не на копиях-фикстурах:
 * `data/songs/*.chordpro` лежит в репозитории, и именно эти файлы импортируются в Directus.
 * Копия шести песен в `__fixtures__` разошлась бы с корпусом при первом же переимпорте.
 */
const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'songs');

/** Экстремумы из таблицы §12 + песни с нестандартными токенами. */
const EXTREMES = [
  '1-аллилуйя-наш-спаситель.chordpro', // аккорды внутри слова, [|]
  '45-святая-ночь.chordpro', // самая плотная строка: 110 симв., 7 токенов
  '66-на-кресте-совершилось-всё.chordpro', // 42 аккордовые строки подряд
  '64-его-слава-благо-мне.chordpro', // самая длинная песня (101 строка)
  '13-гимн-небесный.chordpro', // длинные строки, тире и спецсимволы
  '14-глубока-подобно-морю.chordpro', // цепочка [E-B/D#-E/D]
  '42-придите-и-прославьте-все.chordpro', // [(пауза)]
  '51-только-под-рукой-всевышнего.chordpro', // [(capella)]
];

const MARKER_RE = /\[([^\]]*)\]/g;

function markersOf(text: string): string[] {
  return Array.from(text.matchAll(MARKER_RE), (match) => match[1]);
}

function keyOf(content: string): string {
  return /\{key:\s*([^}]+)\}/.exec(content)?.[1].trim() ?? 'C';
}

function read(file: string): string {
  return readFileSync(join(CORPUS_DIR, file), 'utf-8');
}

/** Все сдвиги, чтобы поймать и энгармонию, и края (0 — identity-ветка, 12 — октава). */
const SEMITONES = [0, 1, 3, 5, 6, 7, 11, 12];

describe('транспозиция на экстремумах корпуса', () => {
  it.each(EXTREMES)('%s: маркеры сохраняются, bar/note не меняются', (file) => {
    const content = read(file);
    const key = keyOf(content);
    const before = markersOf(content);
    expect(before.length).toBeGreaterThan(0);

    for (const semitones of SEMITONES) {
      const after = content
        .split('\n')
        .map((line) => transposeLine(line, semitones, key))
        .join('\n');
      const afterMarkers = markersOf(after);

      // Ни один маркер не потерялся и не размножился.
      expect(afterMarkers).toHaveLength(before.length);

      before.forEach((raw, index) => {
        const marker = classifyMarker(raw);
        if (marker.kind !== 'chord') {
          // Такты и текстовые пометки проходят насквозь дословно (§10.3).
          expect(afterMarkers[index]).toBe(raw);
        }
      });
    }
  });

  it.each(EXTREMES)('%s: +12 полутонов сохраняет высоту каждого аккорда', (file) => {
    const content = read(file);
    const key = keyOf(content);

    const transposed = content
      .split('\n')
      .map((line) => transposeLine(line, 12, key))
      .join('\n');

    const before = markersOf(content);
    const after = markersOf(transposed);

    before.forEach((raw, index) => {
      // Сравниваем высоту, а не строку: спеллинг берётся из целевой тональности, поэтому
      // не-диатонический `Eb` в тональности G легально возвращается как `D#` (§10.2).
      const rootBefore = /^([A-G](?:#|b){0,2})/.exec(raw)?.[1];
      const rootAfter = /^([A-G](?:#|b){0,2})/.exec(after[index])?.[1];
      if (rootBefore && rootAfter) {
        expect(Note.chroma(rootAfter)).toBe(Note.chroma(rootBefore));
      } else {
        expect(after[index]).toBe(raw);
      }
    });
  });

  it('весь корпус транспонируется без исключений и без потери маркеров', () => {
    const files = readdirSync(CORPUS_DIR).filter((name) => name.endsWith('.chordpro'));
    expect(files.length).toBeGreaterThan(50);

    for (const file of files) {
      const content = read(file);
      const key = keyOf(content);
      const before = markersOf(content).length;

      for (const semitones of [1, 5, 11]) {
        const after = content
          .split('\n')
          .map((line) => transposeLine(line, semitones, key))
          .join('\n');
        expect(markersOf(after).length, `${file} @ ${semitones}`).toBe(before);
      }
    }
  });
});
