import { describe, expect, it } from 'vitest';
import { MARKED_SECTION_KINDS, classifySection, type SongSectionKind } from './songSectionKind';

describe('classifySection', () => {
  it.each<[string | undefined, SongSectionKind]>([
    // По одному представителю на каждый kind.
    ['Куплет 1', 'verse'],
    ['Припев', 'chorus'],
    ['Предприпев', 'prechorus'],
    ['Бридж', 'bridge'],
    ['Проигрыш', 'instrumental'],
    ['Завершение', 'ending'],
    ['Припева нет', 'other'],

    // Ловушка 1: кириллица не входит в `\w`, поэтому `\b` здесь не работает.
    // `Предприпев` содержит `припев` — спасает только порядок правил.
    ['Предприпев 1', 'prechorus'],
    ['Предприпев 2', 'prechorus'],
    ['Предприпев - 2x', 'prechorus'],
    ['Пре-припев', 'prechorus'],
    ['Выход на припев', 'prechorus'],
    // `Припева нет` не должен стать припевом — это даёт `(?![а-яё])`.
    ['Припева нет', 'other'],

    // Счётчики повторов и ремарки динамики не меняют вид секции.
    ['Припев - 2x', 'chorus'],
    ['Припев 3 - 2x', 'chorus'],
    ['Припев (a capella)', 'chorus'],
    ['Припев - (ff)', 'chorus'],
    ['Куплет 4 (акапелла)', 'verse'],
    ['Куплет 3 (модуляция)', 'verse'],
    ['Мост - 3x', 'bridge'],
    ['Мост -4х', 'bridge'],

    // Латиница корпуса.
    ['Bridge', 'bridge'],
    ['Intro', 'instrumental'],
    ['Intro - 2x', 'instrumental'],
    ['Instrum.', 'instrumental'],
    ['Instrumental', 'instrumental'],
    ['Modulation', 'instrumental'],
    ['End', 'ending'],
    ['Tag', 'ending'],

    // Опечатки и варианты корпуса.
    ['Проигрышь', 'instrumental'],
    ['Инструменты 2', 'instrumental'],
    ['Модуляция', 'instrumental'],
    ['Концовка - x4', 'ending'],
    ['Кода', 'ending'],

    // Регистр и лишние пробелы.
    ['  ПРИПЕВ  ', 'chorus'],
    ['припев', 'chorus'],
    ['  Бридж', 'bridge'],

    // Пустая/отсутствующая метка — первая секция песни бывает без `{comment:}`.
    ['', 'other'],
    ['   ', 'other'],
    [undefined, 'other'],
  ])('%s → %s', (label, expected) => {
    expect(classifySection(label)).toBe(expected);
  });
});

describe('MARKED_SECTION_KINDS', () => {
  it('подложку получают ровно припев, бридж и предприпев', () => {
    expect([...MARKED_SECTION_KINDS].sort()).toEqual(['bridge', 'chorus', 'prechorus']);
  });
});
