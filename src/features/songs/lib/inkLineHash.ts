/**
 * Якорь пометок по СОДЕРЖИМОМУ строки (M9, решение Игоря 2026-09-21).
 *
 * До M9 штрих держался за пару индексов `(section, line)`. Пока песни не правились,
 * этого хватало; правка текста сдвигает индексы, и чужие пометки уезжают на соседние
 * строки. Теперь к паре добавляется хэш содержимого строки, и позиция штриха
 * восстанавливается по нему.
 *
 * Три неочевидных решения:
 *
 * 1. Хэш считается от текста БЕЗ аккордов. Главная правка в M9 — сдвиг съехавшего
 *    аккорда; музыкант, поправивший аккорд, не должен терять пометки на этой строке.
 *    Исключение — строка из одних аккордов (вступление, проигрыш): без аккордов она
 *    пуста и слиплась бы со всеми пустыми строками песни, поэтому её личность —
 *    сами аккорды.
 *
 * 2. Индекс строится от СЫРОГО `song.content` тем же разбором, что и рендер
 *    (`SongView`: `parseSongBlocks` → `block.content.split('\n')`). Разойдись разбор
 *    здесь и там — хэши легли бы на чужие строки.
 *
 * 3. Штрих, чья строка исчезла, «осиротел»: он НЕ рисуется (иначе лёг бы на чужую
 *    строку по старым индексам), но и НЕ удаляется — правку могут откатить, и тогда
 *    пометка должна вернуться. Сохранение обязано дописывать сирот обратно.
 *
 * Старые штрихи без хэша сохранены до того, как правка песен существовала вообще,
 * поэтому их индексы указывают на текущий текст. Хэш им дописывается по индексу —
 * это и есть ленивая миграция.
 *
 * Pure TS — без React и браузерных API.
 */
import type { SongStroke } from '../types';
import { parseSongBlocks } from './songParser';

const CHORD_MARKER = /\[[^\]]*\]/g;

/** Личность строки: текст без аккордов; у строки из одних аккордов — сами аккорды. */
export function lineIdentity(line: string): string {
  const text = line.replace(CHORD_MARKER, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (text) return text;
  const chords = line.replace(/\s+/g, ' ').trim();
  return chords ? `chords:${chords}` : '';
}

/**
 * FNV-1a 32 бита → base36. Криптостойкость не нужна: коллизия двух разных строк одной
 * песни даёт лишь выбор ближайшей по позиции, как у честно повторяющихся строк.
 */
export function songLineHash(line: string): string {
  const identity = lineIdentity(line);
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Хэши строк песни: `[секция][строка]`, в точности как их нумерует рендер. */
export type LineHashIndex = string[][];

export function buildLineHashIndex(content: string): LineHashIndex {
  return parseSongBlocks(content).map((block) => block.content.split('\n').map(songLineHash));
}

/** Якорь новой пометки: индексы из DOM плюс хэш той же строки. */
export function anchorWithHash(section: number, line: number, index: LineHashIndex | null): SongStroke['anchor'] {
  const hash = index?.[section]?.[line];
  return hash === undefined ? { section, line } : { section, line, hash };
}

export interface ResolvedAnchors {
  /** Штрихи, которые можно рисовать; якоря приведены к текущему тексту. */
  strokes: SongStroke[];
  /** Штрихи, чья строка исчезла. Не рисуются, но обязаны пережить сохранение. */
  orphans: SongStroke[];
  /** Сколько штрихов переехало на новую позицию — для диагностики. */
  moved: number;
  /** Сколько старых штрихов получили хэш по индексу. */
  migrated: number;
}

/**
 * Приводит якоря сохранённых штрихов к текущему тексту песни.
 *
 * Порядок разрешения:
 * - хэш совпал на сохранённой позиции → штрих на месте (самый частый случай);
 * - хэш найден в другом месте → переезд; при нескольких совпадениях (повтор строки
 *   припева) — к ближайшему по сквозному номеру строки, чтобы пометка второго припева
 *   не прыгнула в первый;
 * - хэша нет в песне → сирота;
 * - хэша нет у штриха (сохранён до M9) → индекс верен, хэш дописывается по нему.
 */
export function resolveStrokeAnchors(strokes: SongStroke[], index: LineHashIndex): ResolvedAnchors {
  const positions = new Map<string, Array<{ section: number; line: number; ordinal: number }>>();
  const offsets: number[] = [];
  let ordinal = 0;
  index.forEach((lines, section) => {
    offsets[section] = ordinal;
    lines.forEach((hash, line) => {
      const list = positions.get(hash);
      const position = { section, line, ordinal: ordinal + line };
      if (list) list.push(position);
      else positions.set(hash, [position]);
    });
    ordinal += lines.length;
  });

  /** Сквозной номер сохранённой позиции; секция за концом песни — за последней строкой. */
  const ordinalOf = (section: number, line: number): number =>
    section < offsets.length ? offsets[section] + line : ordinal + line;

  const resolved: ResolvedAnchors = { strokes: [], orphans: [], moved: 0, migrated: 0 };

  for (const stroke of strokes) {
    const { section, line, hash } = stroke.anchor;

    if (hash === undefined) {
      const current = index[section]?.[line];
      if (current === undefined) {
        // Позиции нет — рисовать нечего, как и до M9; хранить как есть.
        resolved.strokes.push(stroke);
      } else {
        resolved.strokes.push({ ...stroke, anchor: { section, line, hash: current } });
        resolved.migrated++;
      }
      continue;
    }

    if (index[section]?.[line] === hash) {
      resolved.strokes.push(stroke);
      continue;
    }

    const candidates = positions.get(hash);
    if (!candidates) {
      resolved.orphans.push(stroke);
      continue;
    }

    const target = ordinalOf(section, line);
    let best = candidates[0];
    for (const candidate of candidates) {
      if (Math.abs(candidate.ordinal - target) < Math.abs(best.ordinal - target)) best = candidate;
    }
    resolved.strokes.push({ ...stroke, anchor: { section: best.section, line: best.line, hash } });
    resolved.moved++;
  }

  return resolved;
}
