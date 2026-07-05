// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompletionModal } from './CompletionModal';
import type { ReadingPlanDay } from '@/types';

const day = { id: 42, completed: true, items: [], readings: [] } as unknown as ReadingPlanDay;

describe('CompletionModal', () => {
  it('рендерит заголовок дня и видимую кнопку действия', () => {
    render(<CompletionModal isOpen onClose={vi.fn()} day={day} totalDays={365} />);
    expect(screen.getByText('День 42 из 365')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('кнопка действия вызывает onClose (переход на главную делает вызывающий)', () => {
    const onClose = vi.fn();
    render(
      <CompletionModal isOpen onClose={onClose} day={day} totalDays={365} actionLabel="Отлично" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Отлично' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ничего не рендерит, когда закрыт', () => {
    render(<CompletionModal isOpen={false} onClose={vi.fn()} day={day} />);
    expect(screen.queryByText(/День 42/)).not.toBeInTheDocument();
  });
});
