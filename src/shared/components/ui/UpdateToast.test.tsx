// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateToast } from './UpdateToast';
import { setWaitingWorker } from '@/shared/hooks/useSwUpdate';

function makeFakeWorker(): ServiceWorker {
  return { postMessage: vi.fn() } as unknown as ServiceWorker;
}

describe('UpdateToast', () => {
  afterEach(() => {
    setWaitingWorker(null);
  });

  it('ничего не рендерит, когда обновление не готово', () => {
    render(<UpdateToast />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('показывает тост, когда есть waiting-воркер', () => {
    setWaitingWorker(makeFakeWorker());
    render(<UpdateToast />);
    expect(screen.getByRole('status')).toHaveTextContent('Доступна новая версия');
  });

  it('клик по «Обновить» шлёт SKIP_WAITING воркеру', () => {
    const worker = makeFakeWorker();
    setWaitingWorker(worker);
    render(<UpdateToast />);

    fireEvent.click(screen.getByText('Обновить'));

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('клик по «Позже» скрывает тост', () => {
    setWaitingWorker(makeFakeWorker());
    render(<UpdateToast />);

    fireEvent.click(screen.getByText('Позже'));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
