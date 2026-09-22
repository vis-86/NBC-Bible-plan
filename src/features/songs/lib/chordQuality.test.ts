import { describe, expect, it } from 'vitest';
import {
  formatChordQuality,
  getChordBass,
  hasChordMod,
  parseChordQuality,
  setChordBass,
  toggleChordMod,
} from './chordQuality';

describe('переключение качества', () => {
  it('минор ставится и снимается', () => {
    expect(toggleChordMod('A', 'm')).toBe('Am');
    expect(toggleChordMod('Am', 'm')).toBe('A');
  });

  it('септима добавляется поверх минора', () => {
    expect(toggleChordMod('Am', '7')).toBe('Am7');
    expect(toggleChordMod('Am7', 'm')).toBe('A7');
  });

  it('малая и большая септимы вытесняют друг друга', () => {
    expect(toggleChordMod('A7', 'maj7')).toBe('Amaj7');
    expect(toggleChordMod('Amaj7', '7')).toBe('A7');
    expect(toggleChordMod('Amaj7', 'maj7')).toBe('A');
  });

  it('add9 переключается независимо', () => {
    expect(toggleChordMod('Am7', 'add9')).toBe('Am7add9');
    expect(toggleChordMod('Am7add9', 'add9')).toBe('Am7');
  });
});

describe('канонический порядок записи', () => {
  it('септима встаёт перед sus с любой стороны', () => {
    expect(toggleChordMod('Asus4', '7')).toBe('A7sus4');
    expect(toggleChordMod('A7', 'sus4')).toBe('A7sus4');
  });

  it('бас всегда последний', () => {
    expect(toggleChordMod('G/B', 'm')).toBe('Gm/B');
    expect(toggleChordMod('G/B', '7')).toBe('G7/B');
  });
});

describe('несовместимые части гасят друг друга', () => {
  it('sus убирает минорную терцию', () => {
    expect(toggleChordMod('Am', 'sus4')).toBe('Asus4');
  });

  it('минор убирает sus', () => {
    expect(toggleChordMod('Asus4', 'm')).toBe('Am');
  });

  it('sus4 и sus2 вытесняют друг друга', () => {
    expect(toggleChordMod('Asus4', 'sus2')).toBe('Asus2');
    expect(toggleChordMod('Asus2', 'sus2')).toBe('A');
  });
});

describe('разбор не теряет данные', () => {
  it('разбор и сборка возвращают исходную запись', () => {
    for (const chord of ['A', 'Am', 'C#m7/G#', 'Bb', 'G7sus4', 'Fmaj7', 'Dadd9', 'Am7add9/E']) {
      expect(formatChordQuality(parseChordQuality(chord)), chord).toBe(chord);
    }
  });

  it('нераспознанный хвост сохраняется дословно', () => {
    // Мусор корпуса нельзя «чинить» на лету: песню испортит правка соседнего свойства.
    expect(toggleChordMod('Adim', 'm')).toBe('Amdim');
    expect(formatChordQuality(parseChordQuality('C#mсть.'))).toBe('C#mсть.');
  });

  it('авторский Gsus читается как sus4', () => {
    expect(parseChordQuality('Gsus').sus).toBe('sus4');
  });

  it('нераспознанная тоника не роняет разбор', () => {
    expect(formatChordQuality(parseChordQuality('mod'))).toBe('mod');
    expect(formatChordQuality(parseChordQuality(''))).toBe('');
  });
});

describe('состояние переключателей', () => {
  it('отражает реальное качество аккорда', () => {
    expect(hasChordMod('Am7', 'm')).toBe(true);
    expect(hasChordMod('Am7', '7')).toBe(true);
    expect(hasChordMod('A', 'm')).toBe(false);
  });

  it('maj7 не зажигает переключатель обычной септимы', () => {
    expect(hasChordMod('Amaj7', '7')).toBe(false);
    expect(hasChordMod('Amaj7', 'maj7')).toBe(true);
  });
});

describe('басовая нота', () => {
  it('ставится, читается и снимается', () => {
    expect(setChordBass('Am7', 'E')).toBe('Am7/E');
    expect(getChordBass('Am7/E')).toBe('E');
    expect(setChordBass('Am7/E', '')).toBe('Am7');
  });

  it('лишний слэш во вводе не удваивается', () => {
    expect(setChordBass('G', '/B')).toBe('G/B');
  });
});
