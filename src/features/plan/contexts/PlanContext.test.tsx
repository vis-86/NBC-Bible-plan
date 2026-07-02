// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { ReadingPlanDay } from '@/types';

// Спай на сетевой слой: реальные билдеры мутаций + подменённый graphqlClient.
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock('@/shared/services/api/graphql', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/api/graphql')>(
    '@/shared/services/api/graphql'
  );
  return {
    ...actual,
    graphqlClient: { mutate: mutateMock, query: vi.fn() },
  };
});

import { PlanProvider, usePlanContext } from './PlanContext';

const seedPlan: ReadingPlanDay[] = [
  {
    id: 1,
    dateStr: '2026-01-01',
    completed: false,
    readCount: 0,
    totalItems: 1,
    readings: [{ book: 'Быт', chapter: 1 }],
    items: [{ id: 11, dayNumber: 1, dateStr: '2026-01-01', readText: 'Быт. 1', item: 1, completed: false }],
  },
  {
    id: 2,
    dateStr: '2026-01-02',
    completed: false,
    readCount: 0,
    totalItems: 1,
    readings: [{ book: 'Быт', chapter: 2 }],
    items: [{ id: 21, dayNumber: 2, dateStr: '2026-01-02', readText: 'Быт. 2', item: 1, completed: false }],
  },
];

function Consumer() {
  const { plan, setPlan, toggleCompleteMany } = usePlanContext();
  return (
    <div>
      <button onClick={() => setPlan(seedPlan)}>seed</button>
      <button onClick={() => toggleCompleteMany([1, 2], true)}>mark</button>
      <button onClick={() => toggleCompleteMany([], true)}>markEmpty</button>
      <button onClick={() => toggleCompleteMany([999], true)}>markUnknown</button>
      <span data-testid="completed">
        {plan.filter((d) => d.completed).map((d) => d.id).join(',')}
      </span>
      <span data-testid="items-completed">
        {plan.filter((d) => d.items.length > 0 && d.items.every((i) => i.completed)).map((d) => d.id).join(',')}
      </span>
    </div>
  );
}

async function click(label: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(label));
  });
}

describe('PlanContext.toggleCompleteMany', () => {
  beforeEach(() => {
    mutateMock.mockReset().mockResolvedValue({});
  });

  it('fires exactly one batch request and optimistically marks all days + items complete', async () => {
    render(
      <PlanProvider>
        <Consumer />
      </PlanProvider>
    );

    await click('seed');
    await click('mark');

    // Ровно один сетевой вызов на весь набор дней.
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const arg = mutateMock.mock.calls[0][0];
    expect(arg.query).toContain('UpdateProgressBatch');
    expect(arg.variables).toEqual({ days: [1, 2], completed: true });

    // Оптимистичный апдейт: оба дня и их items отмечены прочитанными.
    expect(screen.getByTestId('completed').textContent).toBe('1,2');
    expect(screen.getByTestId('items-completed').textContent).toBe('1,2');
  });

  it('is a no-op (zero network calls) for an empty or all-unknown day set', async () => {
    render(
      <PlanProvider>
        <Consumer />
      </PlanProvider>
    );

    await click('seed');
    await click('markEmpty');
    await click('markUnknown');

    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('completed').textContent).toBe('');
  });
});
