// @vitest-environment jsdom
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FloatingChapterNav } from './FloatingChapterNav';
import { ChromeVisibilityProvider } from '@/shared/components/layout/ChromeVisibility';

function renderNav(props: Partial<React.ComponentProps<typeof FloatingChapterNav>> = {}) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const utils = render(
    <ChromeVisibilityProvider>
      <FloatingChapterNav
        onPrev={onPrev}
        onNext={onNext}
        canPrev
        canNext
        isPlanMode={false}
        {...props}
      />
    </ChromeVisibilityProvider>
  );
  return { ...utils, onPrev, onNext };
}

describe('FloatingChapterNav', () => {
  it('в режиме плана на последней главе дня показывает ✓ вместо ›', () => {
    renderNav({ isPlanMode: true, canNext: false });
    expect(screen.getByLabelText('Завершить день')).toBeInTheDocument();
    expect(screen.queryByLabelText('Следующая глава')).not.toBeInTheDocument();
  });

  it('вне плана (day=null) на последней главе нет ✓ — кнопка next просто disabled', () => {
    renderNav({ isPlanMode: false, canNext: false });
    expect(screen.queryByLabelText('Завершить день')).not.toBeInTheDocument();
    expect(screen.getByTestId('floating-nav-next')).toBeDisabled();
  });

  it('prev disabled когда canPrev=false', () => {
    renderNav({ canPrev: false });
    expect(screen.getByTestId('floating-nav-prev')).toBeDisabled();
  });

  it('клик по prev/next вызывает колбэки', () => {
    const { onPrev, onNext } = renderNav();
    fireEvent.click(screen.getByTestId('floating-nav-prev'));
    fireEvent.click(screen.getByTestId('floating-nav-next'));
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('в режиме плана ✓ на последней главе НЕ disabled (можно завершить день)', () => {
    renderNav({ isPlanMode: true, canNext: false });
    expect(screen.getByTestId('floating-nav-next')).not.toBeDisabled();
  });
});
