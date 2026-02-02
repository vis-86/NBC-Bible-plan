import { useState, useEffect } from 'react';
import { BibleReference, ReadingPlanDay, PlanItem } from '@/types';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import { parseReadingItem } from '@/shared/utils/bible';

interface UseChapterNavigationProps {
  currentReading: BibleReference | null;
  day: ReadingPlanDay | null;
  currentItem: PlanItem | null;
  onNavigateChapter?: (book: string, chapter: number, dayId?: number, itemNumber?: number) => void;
  onChapterRead?: (dayId: number, itemNumber: number) => void;
}

export function useChapterNavigation({
  currentReading,
  day,
  currentItem,
  onNavigateChapter,
  onChapterRead
}: UseChapterNavigationProps) {
  const [currentItemState, setCurrentItemState] = useState<PlanItem | null>(currentItem || null);
  const [currentReadingState, setCurrentReadingState] = useState<BibleReference | null>(currentReading);

  // Обновляем currentItemState при изменении currentItem извне
  useEffect(() => {
    if (currentItem) {
      setCurrentItemState(currentItem);
    } else if (currentItemState && !currentItem) {
      setCurrentItemState(null);
    }
  }, [currentItem]);

  // Обновляем currentItemState при изменении day
  useEffect(() => {
    if (day && day.items && currentItemState) {
      const updatedItem = day.items.find(i => i.item === currentItemState.item);
      if (updatedItem && (updatedItem.completed !== currentItemState.completed || updatedItem.id !== currentItemState.id)) {
        setCurrentItemState(updatedItem);
      }
    }
  }, [day?.items, currentItemState?.item]);

  // Обновляем currentReadingState при изменении currentReading
  useEffect(() => {
    if (currentReading) {
      setCurrentReadingState(currentReading);
    }
  }, [currentReading]);

  const handleNextChapter = () => {
    if (!currentReadingState) return;
    
    // Если есть день и items, ищем следующую главу в плане
    if (day && day.items && day.items.length > 0 && currentItemState) {
      // Отмечаем ТЕКУЩУЮ главу как прочитанную перед переходом
      if (onChapterRead && !currentItemState.completed) {
        onChapterRead(day.id, currentItemState.item);
      }

      const currentItemIndex = day.items.findIndex(item => item.item === currentItemState.item);
      if (currentItemIndex >= 0 && currentItemIndex < day.items.length - 1) {
        const nextItem = day.items[currentItemIndex + 1];
        const nextReading = parseReadingItem(nextItem.readText);
        if (nextReading) {
          if (onNavigateChapter) {
            onNavigateChapter(nextReading.book, nextReading.chapter, day.id, nextItem.item);
            return;
          }
          
          setCurrentItemState(nextItem);
          setCurrentReadingState(nextReading);
          return;
        }
      }
      // Если это была последняя глава в плане для этого дня,
      // мы уже вызвали onChapterRead выше, что триггернет CompletionModal в ReadingView
      return;
    }
    
    // Иначе переходим к следующей главе книги
    const bookInfo = BIBLE_STRUCTURE.find(b => b.name === currentReadingState.book);
    const maxChapters = bookInfo?.chapters || 999;
    const nextChapter = currentReadingState.chapter + 1;
    
    if (nextChapter <= maxChapters) {
      if (onNavigateChapter) {
        onNavigateChapter(currentReadingState.book, nextChapter);
        return;
      }
      
      const newReading = { ...currentReadingState, chapter: nextChapter };
      setCurrentReadingState(newReading);
      setCurrentItemState(null);
    }
  };
  
  const handlePrevChapter = () => {
    if (!currentReadingState) return;
    
    // Если есть день и items, ищем предыдущую главу в плане
    if (day && day.items && day.items.length > 0 && currentItemState) {
      const currentItemIndex = day.items.findIndex(item => item.item === currentItemState.item);
      if (currentItemIndex > 0) {
        const prevItem = day.items[currentItemIndex - 1];
        const prevReading = parseReadingItem(prevItem.readText);
        if (prevReading) {
          if (onNavigateChapter) {
            onNavigateChapter(prevReading.book, prevReading.chapter, day.id, prevItem.item);
            return;
          }
          
          setCurrentItemState(prevItem);
          setCurrentReadingState(prevReading);
          return;
        }
      }
      return;
    }
    
    // Иначе переходим к предыдущей главе книги
    if (currentReadingState.chapter > 1) {
      const prevChapter = currentReadingState.chapter - 1;
      
      if (onNavigateChapter) {
        onNavigateChapter(currentReadingState.book, prevChapter);
        return;
      }
      
      const newReading = { ...currentReadingState, chapter: prevChapter };
      setCurrentReadingState(newReading);
      setCurrentItemState(null);
    }
  };

  const canGoNext = () => {
    if (!currentReadingState) return false;
    
    if (day && day.items && day.items.length > 0 && currentItemState) {
      const currentItemIndex = day.items.findIndex(item => item.item === currentItemState.item);
      return currentItemIndex < day.items.length - 1;
    }
    
    const bookInfo = BIBLE_STRUCTURE.find(b => b.name === currentReadingState.book);
    return currentReadingState.chapter < (bookInfo?.chapters || 999);
  };

  const canGoPrev = () => {
    if (!currentReadingState) return false;
    
    if (day && day.items && day.items.length > 0 && currentItemState) {
      const currentItemIndex = day.items.findIndex(item => item.item === currentItemState.item);
      return currentItemIndex > 0;
    }
    
    return currentReadingState.chapter > 1;
  };

  return {
    currentItemState,
    currentReadingState,
    handleNextChapter,
    handlePrevChapter,
    canGoNext,
    canGoPrev
  };
}

