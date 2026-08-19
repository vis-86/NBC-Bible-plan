// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useDelayedFlag } from './useDelayedFlag';

function Harness({ loading }: { loading: boolean }) {
  const visible = useDelayedFlag(loading, 180);
  return <span data-testid="state">{visible ? 'spinner' : 'none'}</span>;
}

describe('useDelayedFlag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('не показывает индикатор на быстрой (кешированной) загрузке', () => {
    const { getByTestId, rerender } = render(<Harness loading />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<Harness loading={false} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(getByTestId('state').textContent).toBe('none');
  });

  it('показывает индикатор, если загрузка затянулась', () => {
    const { getByTestId } = render(<Harness loading />);
    expect(getByTestId('state').textContent).toBe('none');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(getByTestId('state').textContent).toBe('spinner');
  });

  it('гасит индикатор сразу по завершении загрузки', () => {
    const { getByTestId, rerender } = render(<Harness loading />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<Harness loading={false} />);
    expect(getByTestId('state').textContent).toBe('none');
  });
});
