'use client';

import type React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { useStatusBarColor } from '@/shared/hooks/useStatusBarColor';

/**
 * Вид шапки:
 * - `view` — внутренний экран-«просмотр»: стрелка «назад» + компактный заголовок,
 *   разделитель снизу, тень, sticky. Эталон — календарь, песня.
 * - `page` — top-level таб нижней навигации: крупный заголовок без «назад» и без
 *   разделителя/тени; опциональный below-слот (напр. строка поиска).
 */
type PageHeaderVariant = 'view' | 'page';

interface PageHeaderProps {
  /** Заголовок страницы (h1). Может быть длинным — обрезается многоточием. */
  title: string;
  /**
   * Обработчик кнопки «назад». Навигацией владеет вызывающий (см. ниже).
   * Опционален: кнопка рендерится только когда колбэк передан. Для top-level
   * табов (`variant='page'`) обычно отсутствует.
   */
  onBack?: () => void;
  /** aria-label кнопки возврата. */
  backAriaLabel?: string;
  /** Опциональный слот справа: бейджи, действия (напр. «Все по плану»). */
  right?: React.ReactNode;
  /** Below-слот под строкой заголовка (напр. `SearchBar` на странице «Песни»). */
  children?: React.ReactNode;
  /** Вид шапки (по умолчанию `view`). */
  variant?: PageHeaderVariant;
  /** Липкая шапка (по умолчанию — да, как у календаря). */
  sticky?: boolean;
  /**
   * Плотность (действует только при `variant='view'`, по умолчанию `'default'`).
   * `'compact'` — «шапка режима чтения», паритет с `ReadingHeader`: ниже
   * (`min-h-[52px]`), без тени, заголовок `text-[15px]` вместо `text-lg`.
   * Ни один существующий вызов не меняется (дефолт не трогает их).
   */
  density?: 'default' | 'compact';
}

/**
 * Единая шапка страниц приложения. Два вида (см. `variant`):
 *
 * - `view` — экраны-«просмотры» с кнопкой «назад» (эталон — календарь):
 *   `/dashboard/calendar`, `/dashboard/songs/[id]`.
 * - `page` — top-level табы нижней навигации без «назад» (крупный заголовок):
 *   `/dashboard/settings`, `/dashboard/songs`. Строка поиска и т.п. кладётся в
 *   `children` (below-слот под заголовком).
 *
 * КОГДА ПЕРЕИСПОЛЬЗОВАТЬ: любой новый экран (детальный `view` или tab `page`).
 * Не собирайте шапку вручную — используйте PageHeader.
 *
 * `density='compact'` (только у `variant='view'`) — «шапка режима чтения»: ниже
 * (`min-h-[52px]`), без тени, заголовок `text-[15px]`, паритет с `ReadingHeader`.
 * Дефолт `'default'` не меняет ни один существующий вызов.
 *
 * КОГДА НЕ ИСПОЛЬЗОВАТЬ:
 * - `ReadingHeader` (ридер Библии) — специализированная шапка с настройками
 *   шрифта и пикером глав/книг; остаётся отдельной.
 * - `SongView` внутренний content-header (title/subtitle/meta внутри `<article>`)
 *   — это заголовок контента песни, а не шапка страницы.
 * - `PlanView` приветствие (главная) — прозрачный editorial-хедер без bg-app-surface;
 *   бровь красится отдельной fixed-полоской фоном страницы (см. комментарий в
 *   PlanView.tsx), а не этим компонентом. Форсировать сюда сломало бы этот
 *   инвариант и добавило бы белую плашку там, где сейчас приветствие "плавает"
 *   на фоне страницы.
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
  children,
  variant = 'view',
  sticky = true,
  density = 'default',
}) => {
  if (process.env.NODE_ENV !== 'production') {
    // Standard logging: диагностика рендера шапки (вид/слоты/липкость).
    console.debug('[PageHeader] render', {
      title,
      variant,
      hasRight: !!right,
      hasChildren: !!children,
      sticky,
      density,
    });
  }

  const isPage = variant === 'page';
  const isCompact = variant === 'view' && density === 'compact';

  // Шапка сама красит бровь (pt-safe-*): meta theme-color должен совпадать
  // с её фоном — инвариант «бровь = цвет шапки экрана».
  useStatusBarColor('surface');

  return (
    <header
      data-page-header
      data-page-header-variant={variant}
      data-page-header-density={variant === 'view' ? density : undefined}
      className={cn(
        'top-0 z-10 bg-app-surface px-4',
        // `view` — компактная строка с разделителем и тенью; `page` — крупная
        // шапка таба без бордера/тени и с увеличенным верхним отступом.
        // `compact` — «шапка режима чтения» (паритет с ReadingHeader): ниже,
        // без тени, вертикальное центрирование вместо паддингов.
        // pt-safe-* расширяет шапку под статус-бар (бровь красится её фоном).
        isPage
          ? 'pt-safe-6 pb-3'
          : isCompact
            ? 'flex min-h-[52px] items-center border-b border-app-border pt-safe pb-0'
            : 'border-b border-app-border pt-safe-3 pb-3 shadow-app-sm',
        sticky && 'sticky'
      )}
    >
      <div className={cn('flex items-center', isCompact ? 'w-full gap-2' : 'gap-4')}>
        {onBack && (
          <button
            type="button"
            data-page-header-back
            onClick={onBack}
            aria-label={backAriaLabel}
            className={cn(
              'flex items-center justify-center rounded-app-sm text-app-text-secondary transition-transform duration-150 hover:bg-app-surface-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary',
              isCompact ? '-ml-2 h-11 w-11' : 'p-2'
            )}
          >
            <ArrowLeft size={20} />
          </button>
        )}

        <h1
          className={cn(
            'min-w-0 flex-1 truncate font-bold text-app-text',
            isPage ? 'text-2xl' : isCompact ? 'text-[15px]' : 'text-lg'
          )}
        >
          {title}
        </h1>

        {/* min-w-11 (а не w-11): фиксированная ширина рвала слот с несколькими
            действиями — контент вылезал за правый край экрана (песня: тональность
            + настройки). Для одиночной иконки размер прежний. */}
        {right && <div className={cn('shrink-0', isCompact && '-mr-2 flex h-11 min-w-11 items-center justify-end')}>{right}</div>}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </header>
  );
};

export default PageHeader;
