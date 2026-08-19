// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ChordProHtmlColumn, { type HtmlSection } from './ChordProHtmlColumn';
import { SONG_SECTION_KIND_ATTR, classifySection } from '../../lib/songSectionKind';
import { SONG_LINE_INDEX_ATTR } from '../../lib/inkAnchor';

/**
 * Метки прогоняются через тот же `classifySection`, что и прод: тест проверяет ПРОВОДКУ
 * вида секции в DOM, а не правила классификации (они — в `songSectionKind.test.ts`).
 */
const SECTIONS: HtmlSection[] = ['Куплет 1', 'Припев', 'Бридж', 'Проигрыш'].map((comment) => ({
  comment,
  kind: classifySection(comment),
  lines: ['[Am]Строка'],
}));

describe('ChordProHtmlColumn', () => {
  it('ставит вид секции на каждую секцию', () => {
    const { container } = render(<ChordProHtmlColumn sections={SECTIONS} />);
    const kinds = Array.from(container.querySelectorAll('.cproSongSection'), (node) =>
      // Имя атрибута берётся из константы: строка в тесте разошлась бы с рендером
      // при переименовании и тест бы этого не заметил.
      node.getAttribute(SONG_SECTION_KIND_ATTR),
    );

    expect(kinds).toEqual(['verse', 'chorus', 'bridge', 'instrumental']);
  });

  it('кладёт строки парами, сохраняя исходные индексы якорей пометок', () => {
    const { container } = render(
      <ChordProHtmlColumn sections={[{ kind: classifySection('Куплет 1'), lines: ['раз', 'два', 'три'] }]} />,
    );

    const pairs = Array.from(container.querySelectorAll('.cproSongLinePair'), (pair) =>
      Array.from(pair.querySelectorAll('.cproSongLine'), (line) => [
        line.getAttribute(SONG_LINE_INDEX_ATTR),
        line.textContent,
      ]),
    );

    // Индекс якоря — позиция строки В СЕКЦИИ, а не внутри пары: иначе штрихи M10
    // после включения склейки уехали бы на чужие строки.
    expect(pairs).toEqual([
      [
        ['0', 'раз'],
        ['1', 'два'],
      ],
      [['2', 'три']],
    ]);
  });

  it('секция без метки помечена как other', () => {
    const { container } = render(<ChordProHtmlColumn sections={[{ kind: classifySection(undefined), lines: ['[C]Раз'] }]} />);
    expect(container.querySelector('.cproSongSection')?.getAttribute(SONG_SECTION_KIND_ATTR)).toBe('other');
  });
});
