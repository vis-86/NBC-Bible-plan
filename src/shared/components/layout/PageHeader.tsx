'use client';

import type React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface PageHeaderProps {
  /** Заголовок страницы (h1). Может быть длинным — обрезается многоточием. */
  title: string;
  /** Обработчик кнопки «назад». Навигацией владеет вызывающий (см. ниже). */
  onBack: () => void;
  /** aria-label кнопки возврата. */
  backAriaLabel?: string;
  /** Опциональный слот справа: бейджи, действия (напр. «Все по плану»). */
  right?: React.ReactNode;
  /** Липкая шапка (по умолчанию — да, как у календаря). */
  sticky?: boolean;
}

/**
 * Единая шапка внутренних страниц-«просмотров»: стрелка «назад» + заголовок +
 * опциональный правый слот. Эталон — шапка календаря; используется на
 * `/dashboard/calendar` и `/dashboard/songs/[id]`.
 *
 * КОГДА ПЕРЕИСПОЛЬЗОВАТЬ: любой новый детальный/просмотровый экран с кнопкой
 * возврата назад. Не собирайте такую шапку вручную — используйте PageHeader.
 *
 * КОГДА НЕ ИСПОЛЬЗОВАТЬ:
 * - `ReadingHeader` (ридер Библии) — специализированная шапка с настройками
 *   шрифта и пикером глав/книг; остаётся отдельной.
 * - Top-level табы нижней навигации (напр. `/dashboard/settings`) — там нет
 *   кнопки «назад», PageHeader не нужен.
 *
 * Компонента ЧИСТО презентационная: не обращается к `next/navigation`.
 * Навигацию выполняет вызывающий через колбэк `onBack` — это делает шапку
 * переиспользуемой и тестируемой без мока роутера.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  onBack,
  backAriaLabel = 'Назад',
  right,
  sticky = true,
}) => {
  if (process.env.NODE_ENV !== 'production') {
    // Standard logging: диагностика рендера шапки (title/слот/липкость).
    console.debug('[PageHeader] render', { title, hasRight: !!right, sticky });
  }

  return (
    <header
      data-page-header
      className={cn(
        'top-0 z-10 flex items-center gap-4 border-b border-app-border bg-app-surface px-4 py-3 shadow-app-sm',
        sticky && 'sticky'
      )}
    >
      <button
        type="button"
        data-page-header-back
        onClick={onBack}
        aria-label={backAriaLabel}
        className="rounded-lg p-2 text-app-text-secondary transition-colors hover:bg-app-surface-muted active:scale-95"
      >
        <ArrowLeft size={20} />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-app-text">{title}</h1>

      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
};

export default PageHeader;
