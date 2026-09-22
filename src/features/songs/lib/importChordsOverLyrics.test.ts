import { describe, expect, it } from 'vitest';
import {
  convertChordNotation,
  detectNotation,
  importChordsOverLyrics,
  isChordToken,
} from './importChordsOverLyrics';

/**
 * Только содержательные строки результата. `keepFirstLine` обязателен: без него первая
 * строка фикстуры уезжает в название, и тест молча проверяет пустоту.
 */
function body(text: string): string[] {
  return importChordsOverLyrics(text, { keepFirstLine: true })
    .chordPro.split('\n')
    .filter((line) => line !== '');
}

describe('isChordToken', () => {
  it('принимает аккорды, включая русскую H и цепочки через дефис', () => {
    for (const token of ['A', 'Am', 'F#m7', 'Bb', 'Hm', 'Asus4', 'G/B', 'E-B/D#-E/D', 'Cmaj7', 'Dadd9']) {
      expect(isChordToken(token), token).toBe(true);
    }
  });

  it('отвергает слова текста', () => {
    for (const token of ['Я', 'славлю', 'Бога', 'mod', 'и', 'Amсть.']) {
      expect(isChordToken(token), token).toBe(false);
    }
  });
});

describe('detectNotation', () => {
  it('видит русскую нотацию по H в позиции тоники', () => {
    expect(detectNotation('Hm  D\nтекст строки')).toBe('ru');
  });

  it('не принимает H внутри слова текста за нотацию', () => {
    // Строка с обычным словом — не аккордовая, значит и на нотацию не влияет.
    expect(detectNotation('Hello world\nтекст строки')).toBe('en');
  });

  it('по умолчанию английская', () => {
    expect(detectNotation('A  D  E\nтекст строки')).toBe('en');
  });
});

describe('convertChordNotation', () => {
  it('H становится B, а B становится Bb', () => {
    expect(convertChordNotation('Hm', 'ru')).toBe('Bm');
    expect(convertChordNotation('B', 'ru')).toBe('Bb');
    expect(convertChordNotation('H7', 'ru')).toBe('B7');
  });

  it('уже бемольный B не удваивается', () => {
    expect(convertChordNotation('Bb', 'ru')).toBe('Bb');
  });

  it('конвертирует бас и каждое звено цепочки', () => {
    expect(convertChordNotation('D/H', 'ru')).toBe('D/B');
    expect(convertChordNotation('H-E/H', 'ru')).toBe('B-E/B');
  });

  it('английскую нотацию не трогает', () => {
    expect(convertChordNotation('B', 'en')).toBe('B');
  });
});

describe('привязка аккордов к колонкам', () => {
  it('ставит аккорд перед символом той же колонки', () => {
    const text = ['  A', 'абвгде'].join('\n');
    expect(body(text)).toEqual(['аб[A]вгде']);
  });

  it('вставка справа налево: длина маркера не сдвигает следующие колонки', () => {
    // Колонки: Asus4=0 (5 символов), D=8, E=12. Слева направо маркер [Asus4]
    // сдвинул бы [D] и [E] на свои 7 символов вправо.
    const text = ['Asus4   D   E', 'абвгдежзиклмн'].join('\n');
    expect(body(text)).toEqual(['[Asus4]абвгдежз[D]иклм[E]н']);
  });

  it('три аккорда встают каждый в свою колонку', () => {
    // Колонки 0/4/8 при тексте абвгдежзик: [A] перед «а», [D] перед «д», [E] перед «и».
    const text = ['A   D   E', 'абвгдежзик'].join('\n');
    expect(body(text)).toEqual(['[A]абвг[D]дежз[E]ик']);
  });

  it('аккорд за концом строки прижимается к её концу', () => {
    const text = ['A        E', 'абв'].join('\n');
    expect(body(text)).toEqual(['[A]абв[E]']);
  });
});

describe('секции', () => {
  it('строка с двоеточием становится меткой секции', () => {
    expect(body('1 Куплет:\nтекст строки')).toEqual(['{comment: 1 Куплет}', 'текст строки']);
  });

  it('повтор уезжает в метку, а не в текст песни', () => {
    expect(body('Проигрыш: х2\nA')).toEqual(['{comment: Проигрыш (x2)}', '[A]']);
  });

  it('латинское x2 понимается так же', () => {
    expect(body('Проигрыш: x2\nA')).toEqual(['{comment: Проигрыш (x2)}', '[A]']);
  });

  it('длинная строка с двоеточием остаётся текстом', () => {
    const long = `${'очень длинная строка песни '.repeat(3)}:`;
    expect(body(long)[0]).not.toContain('{comment:');
  });
});

describe('строки без текста под ними', () => {
  it('тактовая схема не съедает следующую строку', () => {
    const text = ['| F#m /// | D /// |', 'Следующая строка текста'].join('\n');
    expect(body(text)).toEqual(['[|] [F#m] /// [|] [D] /// [|]', 'Следующая строка текста']);
  });

  it('одинокий аккорд проигрыша остаётся отдельной строкой', () => {
    expect(body('A\n\nследующий блок')).toEqual(['[A]', 'следующий блок']);
  });

  it('аккордовая строка перед другой аккордовой строкой не склеивается', () => {
    expect(body('A\nD\n')).toEqual(['[A]', '[D]']);
  });
});

describe('одно нераспознанное слово переводит строку в текст', () => {
  it('строка с обычным словом не считается аккордовой', () => {
    // Потерять аккорд хуже, чем не распознать разметку, поэтому правило строгое.
    expect(body('A D слово E\nтекст строки')).toEqual(['A D слово E', 'текст строки']);
  });
});

describe('метаданные вставки', () => {
  it('первая строка становится названием', () => {
    const result = importChordsOverLyrics('Название песни\n\nКуплет:\nтекст');
    expect(result.title).toBe('Название песни');
    expect(result.chordPro.startsWith('{comment: Куплет}')).toBe(true);
  });

  it('keepFirstLine оставляет первую строку в тексте', () => {
    const result = importChordsOverLyrics('текст строки', { keepFirstLine: true });
    expect(result.title).toBeUndefined();
    expect(result.chordPro).toBe('текст строки');
  });

  it('голый URL уходит в source, а не в текст песни', () => {
    const result = importChordsOverLyrics('Название\nтекст\nhttps://example.org/45046', {
      keepFirstLine: false,
    });
    expect(result.source).toBe('https://example.org/45046');
    expect(result.chordPro).not.toContain('http');
  });

  it('URL сразу после аккордовой строки не становится её текстом', () => {
    const result = importChordsOverLyrics('Название\nA  D\nhttps://example.org/1');
    expect(result.source).toBe('https://example.org/1');
    expect(result.chordPro).toBe('[A] [D]');
  });

  it('считает секции и аккорды', () => {
    const result = importChordsOverLyrics(
      ['Название', 'Куплет:', 'A   D', 'абвгдежз', 'Припев:', 'E', 'ийкл'].join('\n'),
    );
    expect(result.stats.sections).toBe(2);
    expect(result.stats.chords).toBe(3);
    expect(result.stats.chordLines).toBe(2);
  });
});

describe('русская нотация в полном проходе', () => {
  it('Hm из холихордса становится Bm', () => {
    const result = importChordsOverLyrics(['Название', 'Hm', 'абвгде'].join('\n'));
    expect(result.notation).toBe('ru');
    expect(result.chordPro).toBe('[Bm]абвгде');
  });

  it('явная английская нотация отменяет автоопределение', () => {
    const result = importChordsOverLyrics(['Название', 'B', 'абвгде'].join('\n'), { notation: 'en' });
    expect(result.chordPro).toBe('[B]абвгде');
  });
});
