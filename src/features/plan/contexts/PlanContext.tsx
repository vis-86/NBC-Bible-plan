'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useTransition, useMemo } from 'react';
import { ReadingPlanDay, BibleReference, PlanItem } from '@/types';
import { planApi, progressApi } from '@/shared/services/api/endpoints';
import { dayOfYearToDateStr, parseReadingItem } from '@/shared/utils/bible';
import { graphqlClient, progressMutations } from '@/shared/services/api/graphql';

interface PlanContextType {
  plan: ReadingPlanDay[];
  readChapters: Set<string>;
  loading: boolean;
  error: string | null;
  selectedDayId: number | null;
  isPending: boolean;
  fetchPlan: () => Promise<void>;
  setSelectedDayId: (id: number | null) => void;
  toggleItem: (dayId: number, itemNumber: number) => Promise<void>;
  toggleComplete: (dayId: number) => Promise<void>;
  setPlan: React.Dispatch<React.SetStateAction<ReadingPlanDay[]>>;
  setReadChapters: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<ReadingPlanDay[]>([]);
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchPlan = useCallback(async () => {
    if (plan.length > 0) return; // Don't fetch if already loaded
    
    setLoading(true);
    setError(null);
    
    try {
      const planResponse = await planApi.getPlan();
      const planData = planResponse.plan;

      const progressResponse = await progressApi.getProgress();
      const progressData = progressResponse.progress;

      const progressMap = new Map<number, { id: number; count: number | null; completedItems: number[] | null }>();
      if (progressData && Array.isArray(progressData)) {
        progressData.forEach((p: any) => {
          progressMap.set(p.day, { 
            id: p.id, 
            count: p.count,
            completedItems: p.completed_items || null
          });
        });
      }

      const dayGroups = new Map<number, any[]>();
      planData.forEach((item: any) => {
        const dayNum = item.numbers;
        if (!dayGroups.has(dayNum)) {
          dayGroups.set(dayNum, []);
        }
        dayGroups.get(dayNum)!.push(item);
      });

      const mappedPlan: ReadingPlanDay[] = [];
      const chapters = new Set<string>();
      const currentYear = new Date().getFullYear();

      dayGroups.forEach((items, dayNumber) => {
        const progress = progressMap.get(dayNumber);
        const totalItems = items.length;
        const readCount = progress?.count ?? null;
        const completedItems = progress?.completedItems ?? null;
        const isFullyCompleted = progress !== undefined && readCount === null;
        const dateStr = dayOfYearToDateStr(dayNumber, currentYear);
        
        const planItems: PlanItem[] = items.map((item: any) => {
          const ref = parseReadingItem(item.read);
          
          // Определяем статус прочтения:
          // 1. Если день полностью прочитан (count === null)
          // 2. Если есть массив completed_items и текущий item в нем
          // 3. Если нет массива, используем старую логику (item <= count)
          let itemCompleted = isFullyCompleted;
          if (!itemCompleted && completedItems && Array.isArray(completedItems)) {
            itemCompleted = completedItems.includes(item.item);
          } else if (!itemCompleted && readCount !== null) {
            itemCompleted = item.item <= readCount;
          }
          
          if (itemCompleted && ref) {
            chapters.add(`${ref.book}_${ref.chapter}`);
          }
          
          return {
            id: item.id,
            dayNumber: item.numbers,
            dateStr,
            readText: item.read,
            item: item.item,
            completed: itemCompleted
          };
        });

        const readings: BibleReference[] = planItems
          .map(pi => parseReadingItem(pi.readText))
          .filter((r): r is BibleReference => r !== null);

        mappedPlan.push({
          id: dayNumber,
          dateStr,
          items: planItems,
          readings,
          completed: isFullyCompleted,
          readCount,
          totalItems
        });
      });

      mappedPlan.sort((a, b) => a.id - b.id);

      setPlan(mappedPlan);
      setReadChapters(chapters);

      // Initialize selectedDayId to today if not set
      if (selectedDayId === null && mappedPlan.length > 0) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now.getTime() - start.getTime();
        const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
        const maxDay = Math.max(...mappedPlan.map(d => d.id));
        const todayId = dayOfYear > maxDay ? maxDay : dayOfYear;
        setSelectedDayId(todayId);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка при загрузке данных.');
      console.error('Error fetching plan:', err);
    } finally {
      setLoading(false);
    }
  }, [plan.length, selectedDayId]);

  const updateProgress = useCallback(async (dayId: number, count: number | null, completedItems?: number[]) => {
    try {
      const mutation = progressMutations.updateProgress(dayId, count, completedItems);
      await graphqlClient.mutate(mutation);
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  }, []);

  const toggleItem = useCallback(async (dayId: number, itemNumber: number) => {
    const day = plan.find(d => d.id === dayId);
    if (!day) return;

    const item = day.items.find(i => i.item === itemNumber);
    if (!item) return;

    const wasItemCompleted = item.completed;
    
    // Получаем список всех прочитанных глав после переключения
    const completedItemNumbers = day.items
      .filter(i => (i.item === itemNumber ? !wasItemCompleted : i.completed))
      .map(i => i.item)
      .sort((a, b) => a - b);
    
    // Определяем, все ли главы прочитаны
    const allItemsCompleted = completedItemNumbers.length === day.totalItems;
    
    // Вычисляем count для обратной совместимости (максимальный последовательный номер)
    let newCount: number | null;
    if (allItemsCompleted) {
      newCount = null; // Весь день прочитан
    } else if (completedItemNumbers.length === 0) {
      newCount = 0; // Ничего не прочитано
    } else {
      // Находим максимальный последовательный номер для обратной совместимости
      const sortedItemNumbers = day.items.map(i => i.item).sort((a, b) => a - b);
      let maxSequentialItem = 0;
      for (const itemNum of sortedItemNumbers) {
        if (completedItemNumbers.includes(itemNum)) {
          maxSequentialItem = itemNum;
        } else {
          break;
        }
      }
      newCount = maxSequentialItem;
    }

    startTransition(() => {
      setPlan(prevPlan => prevPlan.map(d => {
        if (d.id !== dayId) return d;
        const isFullyCompleted = allItemsCompleted;
        const updatedItems = d.items.map(i => ({
          ...i,
          completed: completedItemNumbers.includes(i.item)
        }));
        
        return {
          ...d,
          items: updatedItems,
          readCount: newCount,
          completed: isFullyCompleted
        };
      }));
    });

    try {
      await updateProgress(dayId, newCount, completedItemNumbers);
    } catch (error) {
      // Rollback logic could be added here if needed, 
      // but fetchPlan() in catch block of callers is also an option
      throw error;
    }
  }, [plan, updateProgress]);

  const toggleComplete = useCallback(async (dayId: number) => {
    const day = plan.find(d => d.id === dayId);
    if (!day) return;

    const isCompleted = day.completed;

    startTransition(() => {
      setPlan(prevPlan => prevPlan.map(d => 
        d.id === dayId ? { 
          ...d, 
          completed: !isCompleted,
          readCount: !isCompleted ? null : 0,
          items: d.items.map(item => ({ ...item, completed: !isCompleted }))
        } : d
      ));

      if (!isCompleted) {
        setReadChapters(prev => {
          const next = new Set(prev);
          day.readings.forEach(r => next.add(`${r.book}_${r.chapter}`));
          return next;
        });
      }
    });

    try {
      const count = isCompleted ? 0 : null;
      await updateProgress(dayId, count);
    } catch (error) {
      throw error;
    }
  }, [plan, updateProgress]);

  const value = useMemo(() => ({
    plan,
    readChapters,
    loading,
    error,
    selectedDayId,
    isPending,
    fetchPlan,
    setSelectedDayId,
    toggleItem,
    toggleComplete,
    setPlan,
    setReadChapters
  }), [plan, readChapters, loading, error, selectedDayId, isPending, fetchPlan, toggleItem, toggleComplete]);

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlanContext() {
  const context = useContext(PlanContext);
  if (context === undefined) {
    throw new Error('usePlanContext must be used within a PlanProvider');
  }
  return context;
}
