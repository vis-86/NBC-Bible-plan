// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PagerHint } from './PagerHint';

describe('PagerHint', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('рендерит «2 из 5»', () => {
    const { getByText } = render(<PagerHint visible index={1} total={5} label="Тестовая песня" atEdge={false} />);
    expect(getByText('2 из 5')).toBeTruthy();
    expect(getByText('Тестовая песня')).toBeTruthy();
  });

  it('atEdge → «Это последняя»', () => {
    const { getByText } = render(<PagerHint visible index={4} total={5} label="Не важно" atEdge />);
    expect(getByText('Это последняя')).toBeTruthy();
  });

  // Регрессия «хинт уезжал влево-вверх на половину своего размера»: Tailwind v4
  // центрирует через CSS-свойство `translate`, и собственный inline-`transform`
  // не перебивал его, а складывался с ним.
  it('не задаёт inline transform — центрирование остаётся за translate-утилитами', () => {
    const { container } = render(<PagerHint visible index={1} total={5} label="Тестовая песня" atEdge={false} />);
    const hint = container.querySelector('[data-pager-hint]') as HTMLElement;
    expect(hint.style.transform).toBe('');
    expect(hint.className).toContain('-translate-x-1/2');
    expect(hint.className).toContain('-translate-y-1/2');
  });

  // Во время жеста подсказкой управляет прогресс, а не булев `visible`: она проявляется
  // по мере ухода пальца и тает по мере возврата страницы.
  it('dragging → непрозрачность берётся из --swipe-progress без перехода', () => {
    const { container } = render(
      <PagerHint visible={false} dragging index={1} total={5} label="Тестовая песня" atEdge={false} />,
    );
    const hint = container.querySelector('[data-pager-hint]') as HTMLElement;
    expect(hint.getAttribute('style')).toContain('var(--swipe-progress, 0)');
    expect(hint.style.transitionDuration).toBe('0ms');
  });

  it('visible (вспышка после перехода) → непрозрачность 1 с переходом', () => {
    const { container } = render(<PagerHint visible index={1} total={5} label="Тестовая песня" atEdge={false} />);
    const hint = container.querySelector('[data-pager-hint]') as HTMLElement;
    expect(hint.style.opacity).toBe('1');
    expect(hint.style.transitionDuration).not.toBe('0ms');
  });

  it("label='' → узла data-pager-hint-label нет", () => {
    const { container } = render(<PagerHint visible index={1} total={5} label="" atEdge={false} />);
    expect(container.querySelector('[data-pager-hint-label]')).toBeNull();
  });
});
