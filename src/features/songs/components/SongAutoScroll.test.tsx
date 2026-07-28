// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SongAutoScroll } from './SongAutoScroll';
import { SongToolStack } from './SongToolStack';

/**
 * Регрессия «панель скорости уезжала за правый край»: SongToolStack скрывается
 * CSS-свойством `translate`, а translate у предка создаёт containing block —
 * `fixed`-панель внутри стека считалась бы от 48-пиксельного бокса стека.
 * Поэтому панель обязана жить в портале (document.body), а не внутри стека.
 */
describe('SongAutoScroll', () => {
  const props = {
    step: 2,
    canScroll: true,
    onToggle: vi.fn(),
    onSetStep: vi.fn(),
  };

  it('панель скорости рендерится порталом в body, а не внутри стека', () => {
    const { container } = render(
      <SongToolStack>
        <SongAutoScroll {...props} playing />
      </SongToolStack>,
    );

    const stack = container.querySelector('[data-song-tool-stack]');
    expect(stack).toBeTruthy();
    expect(stack?.querySelector('[data-song-autoscroll-speed]')).toBeNull();
    expect(document.body.querySelector('[data-song-autoscroll-speed]')).toBeTruthy();
  });

  it('FAB остаётся внутри стека (позицию задаёт стек, не собственный оверлей)', () => {
    const { container } = render(
      <SongToolStack>
        <SongAutoScroll {...props} playing={false} />
      </SongToolStack>,
    );

    const stack = container.querySelector('[data-song-tool-stack]');
    expect(stack?.querySelector('[data-song-autoscroll-toggle]')).toBeTruthy();
    // На паузе панели скорости нет нигде.
    expect(document.body.querySelector('[data-song-autoscroll-speed]')).toBeNull();
  });

  it('canScroll=false → контрола нет вовсе', () => {
    const { container } = render(<SongAutoScroll {...props} playing={false} canScroll={false} />);
    expect(container.querySelector('[data-song-autoscroll-toggle]')).toBeNull();
  });
});
