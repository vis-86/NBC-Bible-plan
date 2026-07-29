import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chordProToPlainText, normalizeForSearch, toSearchTokens } from './searchText';

const SAMPLE = readFileSync(join(__dirname, '__fixtures__/sample.chordpro'), 'utf-8');

describe('chordProToPlainText', () => {
  it('склеивает слово, разорванное аккордом', () => {
    expect(chordProToPlainText('бла[A]год[E]ать')).toBe('благодать');
  });

  it('выбрасывает строку из одних аккордов', () => {
    expect(chordProToPlainText('[A] [E] [F#m]\nТекст')).toBe('Текст');
  });

  it('выбрасывает метаданные и границы припева, оставляя комментарии', () => {
    const out = chordProToPlainText(
      '{title: Тестовая}\n{key: D}\n{start_of_chorus}\nСвят\n{end_of_chorus}\n{comment: Проигрыш}'
    );
    expect(out).toBe('Свят\nПроигрыш');
  });

  it('убирает тактовые черты', () => {
    expect(chordProToPlainText('Свят [|] свят | свят')).toBe('Свят свят свят');
  });

  it('сохраняет регистр и пунктуацию — из этого текста строится сниппет', () => {
    expect(chordProToPlainText('[D]О, благодать! Сколь [G]сладок звук')).toBe('О, благодать! Сколь сладок звук');
  });

  it('на реальном ChordPro-образце оставляет только текст песни', () => {
    const out = chordProToPlainText(SAMPLE);

    expect(out).toContain('Говори со мной, Господь');
    expect(out).toContain('Агнец Божий');
    expect(out).toContain('Куплет 1'); // {comment: ...} — видимый текст листа
    expect(out).not.toContain('Тестовая песня'); // {title: ...} — метаданные
    expect(out).not.toContain('[');
    expect(out).not.toContain('{');
  });

  it('пустой вход даёт пустую строку', () => {
    expect(chordProToPlainText('')).toBe('');
  });
});

describe('normalizeForSearch', () => {
  it('уравнивает регистр и пунктуацию', () => {
    expect(normalizeForSearch('«О, благодать!»')).toBe(normalizeForSearch('о благодать'));
  });

  it('уравнивает ё и е', () => {
    expect(normalizeForSearch('Всё')).toBe(normalizeForSearch('все'));
  });

  it('схлопывает пробелы и переводы строк', () => {
    expect(normalizeForSearch('  Свят,\n\n  свят  ')).toBe('свят свят');
  });

  it('строка из одной пунктуации даёт пустую строку', () => {
    expect(normalizeForSearch('—!..')).toBe('');
    expect(normalizeForSearch('')).toBe('');
  });
});

describe('toSearchTokens', () => {
  it('режет запрос на нормализованные слова', () => {
    expect(toSearchTokens('  О,   Благодать! ')).toEqual(['о', 'благодать']);
  });

  it('пустой запрос даёт пустой список', () => {
    expect(toSearchTokens('  ,  ')).toEqual([]);
  });
});
