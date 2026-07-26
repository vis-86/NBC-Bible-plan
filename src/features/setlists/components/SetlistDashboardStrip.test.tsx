// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const { useSetlistsMock } = vi.hoisted(() => ({ useSetlistsMock: vi.fn() }));
vi.mock('../hooks/useSetlists', () => ({ useSetlists: useSetlistsMock }));

import { SetlistDashboardStrip } from './SetlistDashboardStrip';

describe('SetlistDashboardStrip', () => {
  it('пустой список -> не рендерится вовсе', () => {
    useSetlistsMock.mockReturnValue({ setlists: [], loading: false, error: null });
    const { container } = render(<SetlistDashboardStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('во время загрузки -> не рендерится (без скелетона)', () => {
    useSetlistsMock.mockReturnValue({ setlists: [], loading: true, error: null });
    const { container } = render(<SetlistDashboardStrip />);
    expect(container.firstChild).toBeNull();
  });

  it('показывает upcoming+undated в порядке из списка, past не показывает', () => {
    useSetlistsMock.mockReturnValue({
      setlists: [
        { id: 'future', title: 'Будущий', date: '2099-01-01', itemCount: 2 },
        { id: 'undated', title: 'Без даты', date: null, itemCount: 1 },
        { id: 'past', title: 'Прошедший', date: '2000-01-01', itemCount: 3 },
      ],
      loading: false,
      error: null,
    });
    const { container } = render(<SetlistDashboardStrip />);
    const cards = container.querySelectorAll('[data-setlist-strip-card]');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Будущий');
    expect(cards[1].textContent).toContain('Без даты');
  });
});
