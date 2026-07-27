'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Book } from 'lucide-react';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import { getReferenceInfo } from '@/lib/ai';
import { isAIEnabled } from '@/shared/utils/constants';
import { parseReadingItem } from '@/shared/utils/bible';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import { useTheme } from '@/components/ThemeProvider';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { useBibleText } from '../hooks/useBibleText';
import { translationIdForBook } from '../bible-text-cache';
import { useChapterNavigation } from '../hooks/useChapterNavigation';
import { ReadingHeader } from './ReadingHeader';
import { ReadingContent } from './ReadingContent';
import { ReadingSettings } from './ReadingSettings';
import { ChapterPicker } from './ChapterPicker';
import { BookPicker } from './BookPicker';
import { CompletionModal } from './CompletionModal';
import { FloatingChapterNav } from './FloatingChapterNav';
import { useStatusBarColor } from '@/shared/hooks/useStatusBarColor';
import { useScrollDirection } from '@/shared/hooks/useScrollDirection';
import { useChromeVisibility } from '@/shared/components/layout/ChromeVisibility';
import { shouldShowCompletionOnCheck } from '../completionDecision';
import { SwipePager } from '@/shared/components/pager/SwipePager';
import { PagerHint, usePagerHint } from '@/shared/components/pager/PagerHint';

const HINT_HOLD_COMMIT_MS = 900;

interface ReadingViewProps {
  reading: BibleReference | null;
  onBack: () => void;
  day?: ReadingPlanDay | null;
  totalDays?: number;
  currentItem?: PlanItem | null;
  onChapterRead?: (dayId: number, itemNumber: number) => void;
  onNavigateChapter?: (book: string, chapter: number, dayId?: number, itemNumber?: number) => void;
}

export const ReadingView: React.FC<ReadingViewProps> = ({ 
  reading, 
  onBack, 
  day, 
  totalDays,
  currentItem, 
  onChapterRead,
  onNavigateChapter
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [showBookPicker, setShowBookPicker] = useState(false);
  // Показ поздравления — явный, по нажатию ✓ (см. onNext ниже), а не через
  // детекцию перехода day.completed в props: та молча не срабатывала, если
  // последняя глава уже была отмечена (чтение не по порядку) — onChapterRead
  // не вызывался и переход false→true не происходил.
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [contextInfo, setContextInfo] = useState<string | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const { effectiveTheme } = useTheme();
  const { settings, updateSettings, isLoading: settingsLoading } = useReadingSettings();
  const bibleTextTranslationId = reading
    ? translationIdForBook(reading.book, settings.ot_translation, settings.nt_translation)
    : 'rst';
  const { text, loading } = useBibleText(reading, bibleTextTranslationId);
  const {
    currentItemState,
    currentReadingState,
    handleNextChapter,
    handlePrevChapter,
    canGoNext,
    canGoPrev
  } = useChapterNavigation({
    currentReading: reading,
    day: day || null,
    currentItem: currentItem || null,
    onNavigateChapter,
    onChapterRead
  });

  const themeClasses = {
    light: 'bg-white text-stone-800',
    dark: 'bg-stone-900 text-stone-100',
    sepia: 'bg-amber-50 text-stone-900'
  };
  // Пока настройки не загружены, используем тему приложения — иначе в тёмной теме мелькает белый экран
  const displayTheme: 'light' | 'dark' | 'sepia' =
    settings.theme === 'system' || settingsLoading
      ? effectiveTheme
      : (settings.theme as 'light' | 'dark' | 'sepia');

  // Бровь = цвет шапки ридера (ReadingHeader красит её через pt-safe);
  // дублируем в meta theme-color. Hex-значения соответствуют headerTheme
  // в ReadingHeader: white / stone-900 / amber-50 (шапка = фон читалки).
  const READER_STATUS_BAR_COLORS: Record<'light' | 'dark' | 'sepia', string> = {
    light: '#ffffff',
    dark: '#1c1917',
    sepia: '#fffbeb',
  };
  useStatusBarColor(READER_STATUS_BAR_COLORS[displayTheme]);

  const { setChromeHidden } = useChromeVisibility();
  const { hidden: scrollHidden, setHidden: setScrollHidden, ignoreNextScroll } = useScrollDirection(contentRef);
  const pagerHint = usePagerHint();

  useEffect(() => {
    console.debug('[ReadingView] chrome', { hidden: scrollHidden });
    setChromeHidden(scrollHidden);
  }, [scrollHidden, setChromeHidden]);

  // Смена главы = router.push с новыми search-параметрами на тот же маршрут
  // (/dashboard/read?book=&chapter=) — ReadingView НЕ размонтируется. Chrome
  // при этом СОХРАНЯЕТ состояние (скрыт → остаётся скрытым, без прыжка экрана);
  // программный сброс scrollTop не должен трактоваться как «скролл вверх».
  useEffect(() => {
    if (reading && contentRef.current && contentRef.current.scrollTop > 0) {
      ignoreNextScroll();
      contentRef.current.scrollTop = 0;
    }
  }, [reading?.book, reading?.chapter, ignoreNextScroll]);

  // Короткая глава без скролла: scroll-событий нет, вернуть chrome нечем —
  // форсим видимость, когда контент главы загружен и не скроллится.
  useEffect(() => {
    if (loading) return;
    const el = contentRef.current;
    if (el && el.scrollHeight <= el.clientHeight) {
      setScrollHidden(false);
    }
  }, [loading, text, setScrollHidden]);

  // Дешёвая страховка: если ридер всё же размонтируется со скрытым chrome
  // (например, переход на другой маршрут), не оставляем chrome скрытым для
  // следующей страницы. На практике DashboardLayout/ChromeVisibilityProvider
  // рендерится per-page и это состояние и так умирает вместе с провайдером.
  useEffect(() => {
    return () => setChromeHidden(false);
  }, [setChromeHidden]);

  const handleExplain = async () => {
    if (!reading || !isAIEnabled()) return;
    setInfoLoading(true);
    const summary = await getReferenceInfo(
      `О чем говорится в главе ${reading.chapter} книги ${reading.book}?`,
      `Текст главы: ${text.substring(0, 1000)}...` 
    );
    setContextInfo(summary);
    setInfoLoading(false);
  };

  const handleSelectChapter = (item: PlanItem) => {
    const newReading = parseReadingItem(item.readText);
    if (newReading) {
      if (onNavigateChapter && day) {
        onNavigateChapter(newReading.book, newReading.chapter, day.id, item.item);
        setShowChapterPicker(false);
        return;
      }
      
      if (onChapterRead && day && !item.completed) {
        setTimeout(() => {
          onChapterRead(day.id, item.item);
        }, 500);
      }
    }
  };

  const handleSelectBook = (book: string, chapter: number) => {
    if (onNavigateChapter) {
      onNavigateChapter(book, chapter);
      setShowBookPicker(false);
    }
  };

  const handleSettingsChange = async (newSettings: typeof settings) => {
    try {
      await updateSettings(newSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  if (!reading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-app-bg text-app-text">
        <Book size={64} className="mb-6 opacity-10" />
        <h3 className="text-lg font-bold text-app-text mb-2">Библия</h3>
        <p className="text-center text-app-text-muted mb-8 max-w-xs">Выберите книгу и главу в плане чтения для начала изучения.</p>
        <button
          onClick={onBack}
          className="px-8 py-3 bg-app-primary text-app-text-inverse rounded-full font-bold shadow-app-sm active:scale-95 transition-transform"
        >
          Открыть План
        </button>
      </div>
    );
  }

  const currentChapter = currentReadingState?.chapter || reading?.chapter || 1;

  const currentItemEffective = currentItemState || currentItem || null;

  const handleFloatingNext = () => {
    const isLastItem = !canGoNext();

    // Отмечает текущую главу (если ещё не отмечена) и/или листает дальше.
    handleNextChapter();

    if (!isLastItem) return;

    // Последний элемент дня: день завершён этим нажатием ЛИБО уже был
    // полностью завершён (повторное ✓ / чтение не по порядку) → модалка;
    // иначе остались непрочитанные главы → выходим к плану.
    console.debug('[ReadingView] completeDay', { dayId: day?.id, isLastItem });
    if (day && shouldShowCompletionOnCheck(day, currentItemEffective)) {
      setShowCompletionModal(true);
    } else {
      onBack();
    }
  };

  // Свайп между главами: в плане листает day.items, вне плана — главы книги
  // (решение 4). index/label считаем сами — они нужны и для PagerHint во
  // время жеста, и для лога коммита; SwipeDragState.atEdge не годится здесь,
  // т.к. для последней главы дня onEnd задан и SwipePager его atEdge=false.
  const dayItems = day?.items ?? [];
  const swipeCurrentIndex = day
    ? dayItems.findIndex(item => item.item === currentItemEffective?.item)
    : currentChapter - 1;
  const swipeBookInfo = BIBLE_STRUCTURE.find(b => b.name === (currentReadingState?.book || reading.book));
  const swipeTotal = day ? dayItems.length : (swipeBookInfo?.chapters ?? currentChapter);

  const swipeTargetLabel = (targetIndex: number): string => {
    if (day) {
      const item = dayItems[targetIndex];
      if (!item) return '';
      const parsed = parseReadingItem(item.readText);
      return parsed ? `${parsed.book} ${parsed.chapter}` : '';
    }
    const book = currentReadingState?.book || reading.book;
    return `${book} ${targetIndex + 1}`;
  };

  const computeSwipeTarget = (direction: 'prev' | 'next') => {
    const targetIndex = direction === 'next' ? swipeCurrentIndex + 1 : swipeCurrentIndex - 1;
    return {
      index: targetIndex,
      label: swipeTargetLabel(targetIndex),
      atEdge: targetIndex < 0 || targetIndex >= swipeTotal,
    };
  };

  const swipeEnabled = !showBookPicker && !showChapterPicker && !showSettings && !showCompletionModal;

  return (
    <div className={`flex flex-col h-full ${themeClasses[displayTheme] || themeClasses.light} relative`}>
      <ReadingHeader
        currentReading={currentReadingState || reading}
        reading={reading}
        currentChapter={currentChapter}
        day={day || null}
        currentItem={currentItemEffective}
        totalItems={day?.totalItems || day?.items.length}
        displayTheme={displayTheme}
        onSettingsClick={() => setShowSettings(true)}
        onChapterPickerClick={() => setShowChapterPicker(true)}
        onBookPickerClick={() => setShowBookPicker(true)}
      />

      <SwipePager
        enabled={swipeEnabled}
        canPrev={canGoPrev()}
        canNext={canGoNext()}
        onPrev={() => {
          const target = computeSwipeTarget('prev');
          console.debug('[ReadingView] swipe nav', { from: swipeCurrentIndex, to: target.index, planMode: !!day });
          handlePrevChapter();
          pagerHint.showAndHide(target.index, target.label, target.atEdge, HINT_HOLD_COMMIT_MS);
        }}
        onNext={() => {
          const target = computeSwipeTarget('next');
          console.debug('[ReadingView] swipe nav', { from: swipeCurrentIndex, to: target.index, planMode: !!day });
          (day ? handleFloatingNext : handleNextChapter)();
          pagerHint.showAndHide(target.index, target.label, target.atEdge, HINT_HOLD_COMMIT_MS);
        }}
        onEnd={
          day
            ? () => {
                console.debug('[ReadingView] swipe nav', { from: swipeCurrentIndex, to: 'end', planMode: true });
                handleFloatingNext();
              }
            : undefined
        }
        // Во время жеста задаём только СОДЕРЖИМОЕ подсказки: показывает её прогресс
        // жеста. Отпустили, не дойдя до края, — прогресс гаснет вместе с возвратом
        // главы, перехода не происходит.
        onDragChange={(state) => {
          if (!state.active || !state.direction) return;
          const target = computeSwipeTarget(state.direction);
          pagerHint.track(target.index, target.label, target.atEdge);
        }}
        overlay={
          <PagerHint
            visible={pagerHint.state.visible}
            dragging={pagerHint.state.dragging}
            index={pagerHint.state.index}
            total={swipeTotal}
            label={pagerHint.state.label}
            atEdge={pagerHint.state.atEdge}
          />
        }
        className="relative flex-1 overflow-hidden"
      >
        <div
          className={`h-full overflow-y-auto w-full ${themeClasses[displayTheme] || themeClasses.light}`}
          ref={contentRef}
        >
          <div className="max-w-xl mx-auto px-6 py-8 pb-[calc(var(--dock-nav-h)+env(safe-area-inset-bottom)+96px)]">
            <ReadingContent
              text={text}
              loading={loading}
              settings={settings}
              displayTheme={displayTheme}
              contextInfo={contextInfo}
              infoLoading={infoLoading}
              onContextClose={() => setContextInfo(null)}
              day={day || null}
              currentItem={currentItemEffective}
              onChapterRead={onChapterRead}
            />
          </div>
        </div>
      </SwipePager>

      {/* Вне плана (day=null) кнопки скрыты, пока текст главы не загружен —
          паритет со старым запасным футером (рендерился только при !loading). */}
      {(day || (!loading && currentReadingState)) && (
        <FloatingChapterNav
          displayTheme={displayTheme}
          onPrev={handlePrevChapter}
          onNext={day ? handleFloatingNext : handleNextChapter}
          canPrev={canGoPrev()}
          canNext={canGoNext()}
          isPlanMode={!!day}
        />
      )}

      <ReadingSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />

      <ChapterPicker
        isOpen={showChapterPicker}
        onClose={() => setShowChapterPicker(false)}
        day={day || null}
        currentItem={currentItemState || currentItem || null}
        onSelectChapter={handleSelectChapter}
      />

      <BookPicker
        isOpen={showBookPicker}
        onClose={() => setShowBookPicker(false)}
        currentBook={currentReadingState?.book || reading?.book || null}
        currentChapter={currentReadingState?.chapter || reading?.chapter || null}
        onSelectBook={handleSelectBook}
      />

      <CompletionModal
        isOpen={showCompletionModal}
        onClose={() => {
          setShowCompletionModal(false);
          onBack(); // «Продолжить» → на главную (см. handleBack в read/page.tsx)
        }}
        day={day || null}
        totalDays={totalDays}
      />
    </div>
  );
};

export default ReadingView;

