// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ChordProHtmlColumn, { type HtmlSection } from './ChordProHtmlColumn';
import { SONG_SECTION_KIND_ATTR, classifySection } from '../../lib/songSectionKind';

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

  it('секция без метки помечена как other', () => {
    const { container } = render(<ChordProHtmlColumn sections={[{ kind: classifySection(undefined), lines: ['[C]Раз'] }]} />);
    expect(container.querySelector('.cproSongSection')?.getAttribute(SONG_SECTION_KIND_ATTR)).toBe('other');
  });
});
