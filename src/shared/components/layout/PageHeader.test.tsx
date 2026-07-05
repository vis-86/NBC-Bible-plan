// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('рендерит заголовок в h1', () => {
    render(<PageHeader title="Господь — моя крепость" onBack={vi.fn()} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Господь — моя крепость');
  });

  it('вызывает onBack по клику на кнопку возврата', () => {
    const onBack = vi.fn();
    const { container } = render(<PageHeader title="Календарь" onBack={onBack} />);
    fireEvent.click(container.querySelector('[data-page-header-back]')!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('использует backAriaLabel по умолчанию «Назад»', () => {
    render(<PageHeader title="Календарь" onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy();
  });

  it('прокидывает переданный backAriaLabel', () => {
    render(<PageHeader title="Песня" onBack={vi.fn()} backAriaLabel="Назад к списку" />);
    expect(screen.getByRole('button', { name: 'Назад к списку' })).toBeTruthy();
  });

  it('рендерит правый слот, когда он передан', () => {
    render(
      <PageHeader title="Календарь" onBack={vi.fn()} right={<span>Все по плану</span>} />
    );
    expect(screen.getByText('Все по плану')).toBeTruthy();
  });

  it('не рендерит правый слот, когда он не передан', () => {
    render(<PageHeader title="Календарь" onBack={vi.fn()} />);
    expect(screen.queryByText('Все по плану')).toBeNull();
  });

  it('по умолчанию (variant=view) с onBack рендерит кнопку «назад»', () => {
    const { container } = render(<PageHeader title="Календарь" onBack={vi.fn()} />);
    expect(container.querySelector('[data-page-header-back]')).not.toBeNull();
  });

  it('variant=page без onBack не рендерит кнопку «назад», но показывает заголовок', () => {
    const { container } = render(<PageHeader variant="page" title="Песни" />);
    expect(container.querySelector('[data-page-header-back]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Песни');
  });

  it('рендерит below-слот (children) под заголовком', () => {
    render(
      <PageHeader variant="page" title="Песни">
        <input aria-label="Поиск" />
      </PageHeader>
    );
    expect(screen.getByLabelText('Поиск')).toBeTruthy();
  });

  it('view-вариант расширяется под статус-бар (pt-safe-3) — шапка красит бровь', () => {
    const { container } = render(<PageHeader title="Календарь" onBack={vi.fn()} />);
    expect(container.querySelector('[data-page-header]')).toHaveClass('pt-safe-3');
  });

  it('page-вариант расширяется под статус-бар (pt-safe-6)', () => {
    const { container } = render(<PageHeader variant="page" title="Песни" />);
    expect(container.querySelector('[data-page-header]')).toHaveClass('pt-safe-6');
  });

  it('объявляет цвет брови surface через meta theme-color', () => {
    render(<PageHeader title="Календарь" onBack={vi.fn()} />);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBeTruthy();
  });
});
