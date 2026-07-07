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
    setCurrentItemState(currentItem || null);
  }, [currentItem]);

  // Освежаем ПОЛЯ текущего item при обновлении day.items (например, completed
  // после toggleItem → refetch плана). Функциональный updater обязателен:
  // этот эффект гоняется с эффектом смены currentItem выше — обновление через
  // замыкание со stale currentItemState перезатирало только что установленный
  // следующий item обратно на предыдущий, ломая навигацию ‹ › внутри дня.
  useEffect(() => {
    if (!day?.items) return;
    setCurrentItemState(prev => {
      if (!prev) return prev;
      const updatedItem = day.items.find(i => i.item === prev.item);
      if (updatedItem && (updatedItem.completed !== prev.completed || updatedItem.id !== prev.id)) {
        return updatedItem;
      }
      return prev;
    });
  }, [day?.items]);

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

