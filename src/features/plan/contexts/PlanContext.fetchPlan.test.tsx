// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

/**
 * Регрессия (FIX_PLAN): офлайн после «скачать всё» дашборд падал в «Load failed».
 * Причина — прогресс читался тем же fatal-путём, что и дни плана: если plan:progress
 * не прогрет в apiCache, офлайн read-through пробрасывал ошибку сети и ронял ВЕСЬ
 * fetchPlan в catch, хотя plan:days в кеше есть. Прогресс — обогащение, а не
 * обязательные данные: его отсутствие не должно ронять экран.
 */

const { getPlanMock, getProgressMock, getOverlayMock } = vi.hoisted(() => ({
  getPlanMock: vi.fn(),
  getProgressMock: vi.fn(),
  getOverlayMock: vi.fn(),
}));

vi.mock('@/shared/services/api/endpoints', () => ({
  planApi: { getPlan: getPlanMock },
  progressApi: { getProgress: getProgressMock },
}));

vi.mock('@/shared/offline/outbox', () => ({
  getPendingOutboxOverlay: getOverlayMock,
  enqueueSingleProgress: vi.fn(),
  enqueueBatchProgress: vi.fn(),
}));

import { PlanProvider, usePlanContext } from './PlanContext';
import { __deleteDB } from '@/shared/offline/db';

function Consumer() {
  const { plan, error, fetchPlan } = usePlanContext();
  return (
    <div>
      <button onClick={() => fetchPlan()}>load</button>
      <span data-testid="plan-len">{plan.length}</span>
      <span data-testid="error">{error ?? ''}</span>
    </div>
  );
}

async function click(label: string) {
  await act(async () => {
    (await screen.findByText(label)).click();
  });
}

describe('PlanContext.fetchPlan — прогресс не-фатален', () => {
  beforeEach(async () => {
    await __deleteDB();
    getPlanMock.mockReset();
    getProgressMock.mockReset();
    getOverlayMock.mockReset().mockResolvedValue(new Map());
  });

  it('plan:days получен, plan:progress бросает (офлайн, кеша нет) → план рендерится, error не выставляется', async () => {
    getPlanMock.mockResolvedValue({
      plan: [
        { id: 11, numbers: 1, read: 'Быт. 1', item: 1 },
        { id: 12, numbers: 1, read: 'Быт. 2', item: 2 },
      ],
    });
    // Сеть недоступна, plan:progress ни разу не прогрет → read-through бросит.
    getProgressMock.mockRejectedValue(new TypeError('Load failed'));

    render(
      <PlanProvider>
        <Consumer />
      </PlanProvider>
    );

    await click('load');

    await waitFor(() => expect(screen.getByTestId('plan-len').textContent).toBe('1')); // один день из двух item'ов
    expect(screen.getByTestId('error').textContent).toBe('');
  });

  it('оба источника доступны → план рендерится с прогрессом, без error', async () => {
    getPlanMock.mockResolvedValue({ plan: [{ id: 11, numbers: 1, read: 'Быт. 1', item: 1 }] });
    getProgressMock.mockResolvedValue({ progress: [{ day: 1, id: 10, count: null }] });

    render(
      <PlanProvider>
        <Consumer />
      </PlanProvider>
    );

    await click('load');

    await waitFor(() => expect(screen.getByTestId('plan-len').textContent).toBe('1'));
    expect(screen.getByTestId('error').textContent).toBe('');
  });
});
