import { describe, expect, it } from 'vitest';
import { applyCorrections, loadCorrections, type Correction } from './corrections';

const CORRECTION: Correction = {
  book: 'От Матфея',
  chapter: '7',
  find: 'олова зги',
  replace: 'слова эти',
};

describe('applyCorrections', () => {
  it('применяет правку и считает её', () => {
    const chapters = { '7': '28 когда окончил Иисус олова зги, изумлялся народ' };

    const result = applyCorrections('От Матфея', chapters, [CORRECTION]);

    expect(chapters['7']).toContain('слова эти');
    expect(result).toEqual({ applied: 1, problems: [] });
  });

  it('правка чужой книги игнорируется', () => {
    const chapters = { '7': 'олова зги' };

    const result = applyCorrections('От Марка', chapters, [CORRECTION]);

    expect(chapters['7']).toBe('олова зги');
    expect(result.applied).toBe(0);
  });

  it('источник уже исправлен -> правка НЕ применяется молча, а сообщается', () => {
    // Иначе обновлённый модуль тихо разошёлся бы с файлом правок.
    const chapters = { '7': '28 когда окончил Иисус слова эти' };

    const result = applyCorrections('От Матфея', chapters, [CORRECTION]);

    expect(result.applied).toBe(0);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('встречается 0 раз');
  });

  it('неоднозначное совпадение (2 вхождения) -> правка не применяется', () => {
    const chapters = { '7': 'олова зги ... олова зги' };

    const result = applyCorrections('От Матфея', chapters, [CORRECTION]);

    expect(chapters['7']).toBe('олова зги ... олова зги');
    expect(result.problems[0]).toContain('встречается 2 раз');
  });

  it('отсутствующая глава -> сообщение, а не падение', () => {
    const result = applyCorrections('От Матфея', {}, [CORRECTION]);

    expect(result.applied).toBe(0);
    expect(result.problems[0]).toContain('главы нет');
  });

  it('перевод без файла правок -> пустой список, это норма', () => {
    expect(loadCorrections('nrt2019')).toEqual([]);
  });

  it('файл правок Кассиана читается и все правки адресны', () => {
    const corrections = loadCorrections('kassian2019');

    expect(corrections.length).toBeGreaterThan(0);
    for (const c of corrections) {
      expect(c.book).toBeTruthy();
      expect(c.chapter).toBeTruthy();
      expect(c.find).toBeTruthy();
      expect(c.replace).not.toBe(c.find);
    }
  });
});
