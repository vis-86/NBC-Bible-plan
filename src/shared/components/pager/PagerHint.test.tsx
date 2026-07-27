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

  it("label='' → узла data-pager-hint-label нет", () => {
    const { container } = render(<PagerHint visible index={1} total={5} label="" atEdge={false} />);
    expect(container.querySelector('[data-pager-hint-label]')).toBeNull();
  });
});
