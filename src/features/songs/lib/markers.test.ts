import { describe, expect, it } from 'vitest';
import { classifyMarker } from './markers';

describe('classifyMarker', () => {
  it('классифицирует обычные аккорды', () => {
    expect(classifyMarker('G')).toEqual({ kind: 'chord', text: 'G' });
    expect(classifyMarker('C/G')).toEqual({ kind: 'chord', text: 'C/G' });
    expect(classifyMarker('F#sus4')).toEqual({ kind: 'chord', text: 'F#sus4' });
    expect(classifyMarker('Bm7')).toEqual({ kind: 'chord', text: 'Bm7' });
  });

  it('цепочка через дефис — тоже аккорд (сплитом занимается транспозиция)', () => {
    expect(classifyMarker('E-B/D#-E/D')).toEqual({ kind: 'chord', text: 'E-B/D#-E/D' });
  });

  it('распознаёт тактовую черту', () => {
    expect(classifyMarker('|')).toEqual({ kind: 'bar' });
    // Пробелы вокруг черты в корпусе встречаются — это та же черта.
    expect(classifyMarker(' | ')).toEqual({ kind: 'bar' });
  });

  it('распознаёт текстовые пометки в круглых скобках', () => {
    expect(classifyMarker('(пауза)')).toEqual({ kind: 'note', text: '(пауза)' });
    expect(classifyMarker('(capella)')).toEqual({ kind: 'note', text: '(capella)' });
  });

  it('битые данные остаются аккордом и не вызывают ошибки', () => {
    expect(classifyMarker('C#mсть.')).toEqual({ kind: 'chord', text: 'C#mсть.' });
  });

  it('пустой маркер — аккорд с пустым текстом (рендерится как есть)', () => {
    expect(classifyMarker('')).toEqual({ kind: 'chord', text: '' });
  });
});
