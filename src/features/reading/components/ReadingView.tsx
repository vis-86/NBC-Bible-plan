'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Book } from 'lucide-react';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import { getReferenceInfo } from '@/lib/ai';
import { isAIEnabled } from '@/shared/utils/constants';
import { parseReadingItem } from '@/shared/utils/bible';
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
import { ReadingPlanFooter, readerFooterTheme } from './ReadingPlanFooter';
import { useStatusBarColor } from '@/shared/hooks/useStatusBarColor';
import { shouldShowCompletionOnCheck } from '../completionDecision';

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

  useEffect(() => {
    if (reading && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [reading?.book, reading?.chapter]);

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

  return (
    <div className={`flex flex-col h-full ${themeClasses[displayTheme] || themeClasses.light} relative pb-safe`}>
      <ReadingHeader
        currentReading={currentReadingState || reading}
        reading={reading}
        currentChapter={currentChapter}
        day={day || null}
        displayTheme={displayTheme}
        onBack={onBack}
        onSettingsClick={() => setShowSettings(true)}
        onChapterPickerClick={() => setShowChapterPicker(true)}
        onBookPickerClick={() => setShowBookPicker(true)}
      />

      <div className={`flex-1 overflow-y-auto w-full ${themeClasses[displayTheme] || themeClasses.light}`} ref={contentRef}>
        <div className="max-w-xl mx-auto px-6 py-8 pb-32">
          <ReadingContent
            text={text}
            loading={loading}
            settings={settings}
            displayTheme={displayTheme}
            contextInfo={contextInfo}
            infoLoading={infoLoading}
            onContextClose={() => setContextInfo(null)}
            day={day || null}
            currentItem={currentItemState || currentItem || null}
            onChapterRead={onChapterRead}
          />
        </div>
      </div>

      {day ? (
        <ReadingPlanFooter
          day={day}
          currentItem={currentItemState || currentItem || null}
          displayTheme={displayTheme}
          onPrev={handlePrevChapter}
          onNext={() => {
            const isLastItem = !canGoNext();
            const currentItemEffective = currentItemState || currentItem;

            // Отмечает текущую главу (если ещё не отмечена) и/или листает дальше.
            handleNextChapter();

            if (!isLastItem) return;

            // Последний элемент дня: день завершён этим нажатием ЛИБО уже был
            // полностью завершён (повторное ✓ / чтение не по порядку) → модалка;
            // иначе остались непрочитанные главы → выходим к плану.
            if (shouldShowCompletionOnCheck(day, currentItemEffective)) {
              setShowCompletionModal(true);
            } else {
              onBack();
            }
          }}
          canPrev={canGoPrev()}
          canNext={canGoNext()}
        />
      ) : !loading && currentReadingState && (
        // Запасной футер (чтение вне плана): та же тема ридера, что и у
        // ReadingPlanFooter — app-токены здесь давали белый бар над тёмной читалкой.
        <div className={`fixed bottom-0 left-0 right-0 z-40 ${readerFooterTheme[displayTheme].surface} backdrop-blur-md border-t px-6 pb-safe h-[80px] flex items-center justify-between`}>
          <button
            onClick={handlePrevChapter}
            disabled={!canGoPrev()}
            className={`p-3 ${readerFooterTheme[displayTheme].nav} active:scale-90 disabled:opacity-20 transition-all rounded-full`}
          >
            <ChevronLeft size={28} strokeWidth={1.5} />
          </button>
          <button
            onClick={handleNextChapter}
            disabled={!canGoNext()}
            className={`w-12 h-12 flex items-center justify-center ${readerFooterTheme[displayTheme].cta} shadow-md active:scale-95 disabled:opacity-20 transition-all rounded-full`}
          >
            <ChevronRight size={24} strokeWidth={2.5} />
          </button>
        </div>
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

