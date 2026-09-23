import { describe, expect, it } from 'vitest';
import type { SongStroke } from '../types';
import {
  addMissingAnchorHashes,
  anchorWithHash,
  buildLineHashIndex,
  lineIdentity,
  resolveStrokeAnchors,
  songLineHash,
} from './inkLineHash';

const SONG = [
  '{comment: Куплет 1}',
  'Пер[A]вая строка',
  'Вто[D]рая строка',
  '',
  '{comment: Припев}',
  '[E]Строка припева',
  'Ещё строка припева',
  '',
  '{comment: Куплет 2}',
  'Третья строка',
  '',
  '{comment: Припев}',
  '[E]Строка припева',
  'Ещё строка припева',
].join('\n');

function stroke(section: number, line: number, hash?: string, id = `s${section}-${line}`): SongStroke {
  return {
    id,
    tool: 'pen',
    anchor: hash === undefined ? { section, line } : { section, line, hash },
    points: [[1, 2, 0.5]],
    color: '#000',
    width: 2,
  };
}

/** Штрих, сохранённый поверх исходной песни: индексы + хэш той строки. */
function saved(content: string, section: number, line: number, id?: string): SongStroke {
  const index = buildLineHashIndex(content);
  return stroke(section, line, index[section][line], id);
}

describe('личность строки', () => {
  it('без аккордов, регистра и лишних пробелов', () => {
    expect(lineIdentity('Пер[A]вая  стро[D]ка ')).toBe('первая строка');
  });

  it('сдвиг аккорда не меняет хэш — правка аккорда не сиротит пометки', () => {
    expect(songLineHash('Пер[A]вая строка')).toBe(songLineHash('[A]Первая строка'));
  });

  it('строка из одних аккордов не слипается с пустой', () => {
    expect(lineIdentity('[A] [D]')).toBe('chords:[A] [D]');
    expect(songLineHash('[A] [D]')).not.toBe(songLineHash(''));
  });

  it('разный текст — разный хэш', () => {
    expect(songLineHash('Первая строка')).not.toBe(songLineHash('Вторая строка'));
  });
});

describe('индекс хэшей повторяет нумерацию рендера', () => {
  it('секции и строки — как в SongView', () => {
    const index = buildLineHashIndex(SONG);
    expect(index).toHaveLength(4);
    expect(index[0]).toHaveLength(2);
    expect(index[0][0]).toBe(songLineHash('Первая строка'));
    expect(index[1][0]).toBe(songLineHash('Строка припева'));
  });
});

describe('разрешение якорей', () => {
  it('строка на месте — штрих не трогается', () => {
    const s = saved(SONG, 0, 1);
    const result = resolveStrokeAnchors([s], buildLineHashIndex(SONG));
    expect(result.strokes).toEqual([s]);
    expect(result.moved).toBe(0);
  });

  it('вставка строки выше — штрих переезжает за своей строкой', () => {
    const s = saved(SONG, 0, 1);
    const edited = SONG.replace('Пер[A]вая строка', 'Новая строка\nПер[A]вая строка');
    const result = resolveStrokeAnchors([s], buildLineHashIndex(edited));
    expect(result.strokes[0].anchor).toMatchObject({ section: 0, line: 2 });
    expect(result.moved).toBe(1);
  });

  it('новая секция в начале — штрих уходит за своей секцией', () => {
    const s = saved(SONG, 2, 0);
    const edited = `{comment: Вступление}\n[A] [D]\n\n${SONG}`;
    const result = resolveStrokeAnchors([s], buildLineHashIndex(edited));
    expect(result.strokes[0].anchor).toMatchObject({ section: 3, line: 0 });
  });

  it('правка текста самой строки — штрих сиротеет, а не ложится на соседку', () => {
    const s = saved(SONG, 0, 1);
    const edited = SONG.replace('Вто[D]рая строка', 'Вто[D]рая строчка');
    const result = resolveStrokeAnchors([s], buildLineHashIndex(edited));
    expect(result.strokes).toEqual([]);
    expect(result.orphans).toEqual([s]);
  });

  it('откат правки возвращает сироту на место', () => {
    const s = saved(SONG, 0, 1);
    const edited = SONG.replace('Вто[D]рая строка', 'Вто[D]рая строчка');
    const { orphans } = resolveStrokeAnchors([s], buildLineHashIndex(edited));
    const back = resolveStrokeAnchors(orphans, buildLineHashIndex(SONG));
    expect(back.strokes[0].anchor).toMatchObject({ section: 0, line: 1 });
  });

  it('повтор припева: пометка второго припева не прыгает в первый', () => {
    const second = saved(SONG, 3, 0, 'second');
    const first = saved(SONG, 1, 0, 'first');
    // Строка в начале КАЖДОГО припева: на сохранённых позициях теперь чужой текст,
    // и оба штриха обязаны выбирать среди двух совпадений хэша, а не пройти быстрым путём.
    const edited = SONG.replaceAll('[E]Строка припева', 'Вставка\n[E]Строка припева');
    const result = resolveStrokeAnchors([first, second], buildLineHashIndex(edited));
    const byId = Object.fromEntries(result.strokes.map((s) => [s.id, s.anchor]));
    expect(result.moved).toBe(2);
    expect(byId.first).toMatchObject({ section: 1, line: 1 });
    expect(byId.second).toMatchObject({ section: 3, line: 1 });
  });

  it('сдвиг аккорда внутри строки не трогает пометку', () => {
    const s = saved(SONG, 0, 0);
    const edited = SONG.replace('Пер[A]вая строка', '[A]Первая строка');
    const result = resolveStrokeAnchors([s], buildLineHashIndex(edited));
    expect(result.strokes).toEqual([s]);
    expect(result.orphans).toEqual([]);
  });
});

describe('штрихи, сохранённые до M9', () => {
  it('получают хэш по своему индексу', () => {
    const legacy = stroke(1, 1);
    const index = buildLineHashIndex(SONG);
    const result = resolveStrokeAnchors([legacy], index);
    expect(result.strokes[0].anchor).toEqual({ section: 1, line: 1, hash: index[1][1] });
    expect(result.migrated).toBe(1);
  });

  it('с позицией за концом песни остаются как есть', () => {
    const legacy = stroke(9, 9);
    const result = resolveStrokeAnchors([legacy], buildLineHashIndex(SONG));
    expect(result.strokes).toEqual([legacy]);
    expect(result.migrated).toBe(0);
    expect(result.orphans).toEqual([]);
  });
});

describe('anchorWithHash', () => {
  it('дописывает хэш строки', () => {
    const index = buildLineHashIndex(SONG);
    expect(anchorWithHash(0, 1, index)).toEqual({ section: 0, line: 1, hash: index[0][1] });
  });

  it('без индекса или за концом песни — только индексы, без ключа hash', () => {
    expect(anchorWithHash(0, 1, null)).toEqual({ section: 0, line: 1 });
    expect(anchorWithHash(9, 9, buildLineHashIndex(SONG))).toEqual({ section: 9, line: 9 });
  });
});

describe('addMissingAnchorHashes (миграция хранилища T4.1)', () => {
  it('дописывает хэш по индексу и больше ничего не меняет', () => {
    const index = buildLineHashIndex(SONG);
    const hashed = stroke(1, 0, 'чужой-хэш', 'h');
    const result = addMissingAnchorHashes([stroke(0, 1, undefined, 'a'), hashed, stroke(9, 9, undefined, 'x')], index);

    expect(result.strokes.map((s) => s.id)).toEqual(['a', 'h', 'x']);
    expect(result.strokes[0].anchor).toEqual({ section: 0, line: 1, hash: index[0][1] });
    // Уже хэшированный штрих не перепроверяется и не двигается — даже с «неверным» хэшем.
    expect(result.strokes[1]).toBe(hashed);
    // Штрих без строки остаётся без хэша: придумывать ему личность не из чего.
    expect(result.strokes[2].anchor).toEqual({ section: 9, line: 9 });
    expect({ added: result.added, alreadyHashed: result.alreadyHashed, noLine: result.noLine }).toEqual({
      added: 1,
      alreadyHashed: 1,
      noLine: 1,
    });
  });

  it('после миграции разрешение якорей держит штрих на месте и после правки соседней строки', () => {
    const migrated = addMissingAnchorHashes([stroke(0, 1, undefined, 'a')], buildLineHashIndex(SONG)).strokes;
    const edited = SONG.replace('Пер[A]вая строка', 'Новая первая строка\nПер[A]вая строка');
    const resolved = resolveStrokeAnchors(migrated, buildLineHashIndex(edited));
    expect(resolved.strokes[0].anchor.line).toBe(2);
  });
});
