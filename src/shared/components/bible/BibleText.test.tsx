// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BibleText } from './BibleText';
import type { ReadingSettings } from '@/features/reading/types';

const baseSettings: ReadingSettings = {
  font_size: 20,
  line_height: 1.6,
  text_align: 'left',
  theme: 'system',
  verse_numbers_visible: true,
  ot_translation: 'rst',
  nt_translation: 'rst',
  verse_per_line: false,
};

const text = '1 Первый стих. 2 Второй стих. 3 Третий стих.';

describe('BibleText verse anchors', () => {
  it('при видимых номерах стихов ставит data-verse на каждый стих', () => {
    const { container } = render(<BibleText text={text} settings={baseSettings} />);
    const anchors = container.querySelectorAll('[data-verse]');
    expect(Array.from(anchors).map((el) => el.getAttribute('data-verse'))).toEqual(['1', '2', '3']);
  });

  it('при скрытых номерах стихов data-verse остаётся (анкер без видимого номера)', () => {
    const { container } = render(
      <BibleText text={text} settings={{ ...baseSettings, verse_numbers_visible: false }} />
    );
    const anchors = container.querySelectorAll('[data-verse]');
    expect(Array.from(anchors).map((el) => el.getAttribute('data-verse'))).toEqual(['1', '2', '3']);
    // Номера визуально не показываются — якорь не должен занимать место в строке.
    anchors.forEach((el) => expect(el.className).toContain('hidden'));
  });

  it('первый стих абзаца получает такой же якорь, как последующие', () => {
    const { container } = render(<BibleText text={text} settings={baseSettings} />);
    const first = container.querySelector('[data-verse="1"]');
    expect(first).not.toBeNull();
    expect(first?.tagName).toBe('STRONG');
  });
});

describe('BibleText verse_per_line', () => {
  it('verse_per_line=false — без переносов строк между стихами (прежняя разметка)', () => {
    const { container } = render(<BibleText text={text} settings={baseSettings} />);
    expect(container.querySelectorAll('br').length).toBe(0);
  });

  it('verse_per_line=true — перенос строки перед каждым стихом, КРОМЕ первого', () => {
    const { container } = render(<BibleText text={text} settings={{ ...baseSettings, verse_per_line: true }} />);
    const p = container.querySelector('p');
    const children = Array.from(p?.childNodes ?? []);
    const verse1Index = children.findIndex((n) => (n as HTMLElement).getAttribute?.('data-verse') === '1');
    const verse2Index = children.findIndex((n) => (n as HTMLElement).getAttribute?.('data-verse') === '2');

    expect(container.querySelectorAll('br').length).toBe(2); // перед стихом 2 и 3, не перед 1
    // Перед стихом 1 br НЕТ (это первый стих главы) — предыдущий узел не <br>.
    expect((children[verse1Index - 1] as HTMLElement)?.tagName).not.toBe('BR');
    // Перед стихом 2 br ЕСТЬ.
    expect((children[verse2Index - 1] as HTMLElement)?.tagName).toBe('BR');
  });

  it('verse_per_line=true + verse_numbers_visible=false — перенос сохраняется, номер скрыт', () => {
    const { container } = render(
      <BibleText text={text} settings={{ ...baseSettings, verse_per_line: true, verse_numbers_visible: false }} />
    );
    expect(container.querySelectorAll('br').length).toBe(2);
    container.querySelectorAll('[data-verse]').forEach((el) => expect(el.className).toContain('hidden'));
  });
});
