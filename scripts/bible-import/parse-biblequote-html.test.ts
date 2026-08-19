import { describe, expect, it } from 'vitest';
import { parseBiblequoteBookHtml } from './parse-biblequote-html';

/**
 * Регрессия на реальный дефект модуля Кассиана: файл книги «К Титу» (63.HTM) содержит
 * в конце лишний блок «К Филимону 1». Пока главы ключевались одним лишь номером из
 * заголовка, этот блок молча ПЕРЕЗАПИСЫВАЛ Тит 1 — в приложении Павел писал Филимону
 * внутри послания Титу. Проверка по количеству глав такое не ловит: их по-прежнему 3.
 */
const TITUS_WITH_STRAY_PHILEMON = `
<BODY><HTML>
<h4>К Титу 1</h4>
<p>1 Павел, раб Божий, апостол же Иисуса Христа</p>
<h4>К Титу 2</h4>
<p>1 Ты же говори то, что подобает здравому учению</p>
<h4>К Титу 3</h4>
<p>1 Напоминай им подчиняться властям</p>
<h4>К Филимону 1</h4>
<p>1 Павел, узник Христа Иисуса, и Тимофей брат, Филимону</p>
`;

describe('parseBiblequoteBookHtml', () => {
  it('чужой блок другой книги не перезаписывает главу с тем же номером', () => {
    const { chapters, foreignChapters } = parseBiblequoteBookHtml(TITUS_WITH_STRAY_PHILEMON);

    expect(Object.keys(chapters).sort()).toEqual(['1', '2', '3']);
    expect(chapters['1']).toContain('Павел, раб Божий');
    expect(chapters['1']).not.toContain('Филимону');
    expect(foreignChapters).toEqual([{ header: 'К Филимону 1', chapter: '1' }]);
  });

  it('имя книги берётся из файла, а не из INI: «Иуды» в INI и «Иуда» в HTML — книга НЕ пустеет', () => {
    // Регрессия на собственный перегиб: строгое сравнение с FullName из INI выбрасывало
    // законный блок и оставляло книгу Иуды вообще без текста.
    const html = `<h4>Иуда 1</h4><p>1 Иуда, раб Иисуса Христа, брат Иакова</p>`;

    const { chapters, foreignChapters, bookName } = parseBiblequoteBookHtml(html);

    expect(chapters['1']).toContain('Иуда, раб Иисуса Христа');
    expect(foreignChapters).toEqual([]);
    expect(bookName).toBe('Иуда');
  });

  it('чистый файл разбирается полностью, чужих блоков нет', () => {
    const html = `
      <h4>К Филимону 1</h4>
      <p>1 Павел, узник Христа Иисуса</p>
      <p>2 и Апфии сестре</p>
    `;

    const { chapters, foreignChapters } = parseBiblequoteBookHtml(html);

    expect(chapters).toEqual({ '1': '1 Павел, узник Христа Иисуса 2 и Апфии сестре' });
    expect(foreignChapters).toEqual([]);
  });

  it('рваные пробелы в заголовке не делают книгу чужой', () => {
    const html = `<h4>К  Титу   1</h4><p>1 Павел, раб Божий</p>`;

    const { chapters, foreignChapters } = parseBiblequoteBookHtml(html);

    expect(chapters['1']).toContain('Павел, раб Божий');
    expect(foreignChapters).toEqual([]);
  });
});
