import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isChordToken } from './importChordsOverLyrics';

/**
 * Приёмка распознавателя аккордов на РЕАЛЬНОМ корпусе, по образцу
 * `songSectionKind.corpus.test.ts`: `data/songs/*.chordpro` лежит в репозитории, и
 * именно эти файлы импортируются в Directus.
 *
 * Смысл теста: если музыкант добавит песню с незнакомой записью аккорда, сборка падает
 * здесь, а не тихо превращает аккордовую строку вставки в текст песни.
 *
 * Всё, что не распознаётся сегодня, перечислено в `KNOWN_BAD` с причиной. Список не
 * «затыкает» тест: он фиксирует известные дефекты ДАННЫХ, и каждая новая строка в нём
 * должна быть осознанным решением.
 */
const CORPUS_DIR = join(__dirname, '..', '..', '..', '..', 'data', 'songs');

const MARKER_RE = /\[([^\]]*)\]/g;

/**
 * Дефекты данных корпуса. Рендер их терпит намеренно (`markers.ts`), но аккордами
 * они не являются — распознаватель вставки обязан их отвергать.
 *
 * Два из них невидимы глазом и ломают транспозицию (аккорд остаётся непереведённым,
 * пока соседние переводятся): `С#m` записан КИРИЛЛИЧЕСКОЙ «С», а перед `E` стоит
 * zero-width space U+200B.
 */
const KNOWN_BAD = new Map<string, string>([
  ['(', 'скобка как отдельный маркер'],
  [')', 'скобка как отдельный маркер'],
  ['-', 'разделитель как отдельный маркер'],
  ['/', 'разделитель как отдельный маркер'],
  ['–', 'en dash вместо дефиса'],
  ['​E', 'zero-width space перед нотой — ломает транспозицию'],
  ['С#m', 'кириллическая С вместо латинской — ломает транспозицию'],
  ['Fm#', 'опечатка: должно быть F#m'],
  ['D/Bm', 'лад у басовой ноты'],
  ['Am/c', 'басовая нота в нижнем регистре'],
  ['D/A|', 'тактовая черта приклеена к аккорду'],
  ['||', 'двойная тактовая черта — не одиночный маркер [|]'],
  ['mod', 'ремарка «модуляция» без скобок'],
  ['C#mсть.', 'обрывок текста, затёкший в маркер'],
]);

function corpusMarkers(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(CORPUS_DIR).filter((name) => name.endsWith('.chordpro'))) {
    const content = readFileSync(join(CORPUS_DIR, file), 'utf-8');
    for (const match of content.matchAll(MARKER_RE)) {
      const token = match[1].trim();
      if (token && !found.has(token)) found.set(token, file);
    }
  }
  return found;
}

/** Не аккорды по определению: тактовая черта и текстовая ремарка (`markers.ts`). */
function isNonChordMarker(token: string): boolean {
  return token === '|' || /^\(.*\)$/.test(token);
}

describe('распознавание аккордов на корпусе', () => {
  const markers = corpusMarkers();

  it('корпус на месте', () => {
    expect(markers.size).toBeGreaterThan(100);
  });

  it('каждый аккорд корпуса распознаётся, кроме известных дефектов данных', () => {
    const unexpected: string[] = [];
    for (const [token, file] of markers) {
      if (isNonChordMarker(token) || KNOWN_BAD.has(token)) continue;
      if (!isChordToken(token)) unexpected.push(`${JSON.stringify(token)} (${file})`);
    }
    expect(unexpected).toEqual([]);
  });

  it('известные дефекты действительно не распознаются', () => {
    // Если дефект в данных починили, строку из KNOWN_BAD надо убрать — тест напомнит.
    const nowValid: string[] = [];
    for (const token of KNOWN_BAD.keys()) {
      if (!markers.has(token)) continue; // дефект исчез из корпуса — это норма
      if (isChordToken(token)) nowValid.push(token);
    }
    expect(nowValid).toEqual([]);
  });

  it('цепочки аккордов через дефис считаются аккордом', () => {
    const chains = [...markers.keys()].filter((t) => t.includes('-') && t.length > 1);
    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) {
      if (KNOWN_BAD.has(chain)) continue;
      expect(isChordToken(chain), chain).toBe(true);
    }
  });
});
