'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useTransition, useMemo } from 'react';
import { ReadingPlanDay, BibleReference, PlanItem } from '@/types';
import { planApi, progressApi } from '@/shared/services/api/endpoints';
import { ApiClientError } from '@/shared/services/api/client';
import { dayOfYearToDateStr, parseReadingItem } from '@/shared/utils/bible';
import { graphqlClient, progressMutations } from '@/shared/services/api/graphql';

type ProgressApiRow = {
  day: number;
  id: number;
  count: number | null;
  completed_items?: number[] | null;
};

type PlanApiItem = {
  id: number;
  numbers: number;
  read: string;
  item: number;
};

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
  toggleCompleteMany: (dayIds: number[], completed: boolean) => Promise<void>;
  setPlan: React.Dispatch<React.SetStateAction<ReadingPlanDay[]>>;
  setReadChapters: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const PlanContext = createContext<PlanContextType | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<ReadingPlanDay[]>([]);
  const planRef = useRef<ReadingPlanDay[]>(plan);
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

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
        (progressData as ProgressApiRow[]).forEach((p) => {
          progressMap.set(p.day, { 
            id: p.id, 
            count: p.count,
            completedItems: p.completed_items || null
          });
        });
      }

      const dayGroups = new Map<number, PlanApiItem[]>();
      (planData as PlanApiItem[]).forEach((item) => {
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
        
        const planItems: PlanItem[] = items.map((item) => {
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
      planRef.current = mappedPlan;
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
    } catch (err: unknown) {
      if (ApiClientError.isSessionExpired(err)) return;
      setError((err as Error)?.message || 'Ошибка при загрузке данных.');
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
    const day = planRef.current.find((d) => d.id === dayId);
    if (!day) return;

    const item = day.items.find((i) => i.item === itemNumber);
    if (!item) return;

    const wasItemCompleted = item.completed;

    const completedItemNumbers = day.items
      .filter((i) => (i.item === itemNumber ? !wasItemCompleted : i.completed))
      .map((i) => i.item)
      .sort((a, b) => a - b);

    const allItemsCompleted = completedItemNumbers.length === day.totalItems;

    let newCount: number | null;
    if (allItemsCompleted) {
      newCount = null;
    } else if (completedItemNumbers.length === 0) {
      newCount = 0;
    } else {
      const sortedItemNumbers = day.items.map((i) => i.item).sort((a, b) => a - b);
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

    planRef.current = planRef.current.map((d) => {
      if (d.id !== dayId) return d;
      const updatedItems = d.items.map((i) => ({
        ...i,
        completed: completedItemNumbers.includes(i.item),
      }));

      return {
        ...d,
        items: updatedItems,
        readCount: newCount,
        completed: allItemsCompleted,
      };
    });

    startTransition(() => {
      setPlan((prevPlan) =>
        prevPlan.map((d) => {
          if (d.id !== dayId) return d;
          const updatedItems = d.items.map((i) => ({
            ...i,
            completed: completedItemNumbers.includes(i.item),
          }));

          return {
            ...d,
            items: updatedItems,
            readCount: newCount,
            completed: allItemsCompleted,
          };
        })
      );

      setReadChapters((prev) => {
        const next = new Set(prev);
        if (allItemsCompleted) {
          day.readings.forEach((r) => next.add(`${r.book}_${r.chapter}`));
          return next;
        }

        const toggledRef = parseReadingItem(item.readText);
        if (toggledRef) {
          const chapterKey = `${toggledRef.book}_${toggledRef.chapter}`;
          if (wasItemCompleted) next.delete(chapterKey);
          else next.add(chapterKey);
        }

        return next;
      });
    });

    try {
      await updateProgress(dayId, newCount, completedItemNumbers);
    } catch (error) {
      // Rollback logic could be added here if needed, 
      // but fetchPlan() in catch block of callers is also an option
      throw error;
    }
  }, [updateProgress]);

  const toggleComplete = useCallback(async (dayId: number) => {
    const day = planRef.current.find((d) => d.id === dayId);
    if (!day) return;

    const isCompleted = day.completed;

    planRef.current = planRef.current.map((d) =>
      d.id === dayId
        ? {
            ...d,
            completed: !isCompleted,
            readCount: !isCompleted ? null : 0,
            items: d.items.map((item) => ({ ...item, completed: !isCompleted })),
          }
        : d
    );

    startTransition(() => {
      setPlan((prevPlan) =>
        prevPlan.map((d) =>
          d.id === dayId
            ? {
                ...d,
                completed: !isCompleted,
                readCount: !isCompleted ? null : 0,
                items: d.items.map((item) => ({ ...item, completed: !isCompleted })),
              }
            : d
        )
      );

      setReadChapters((prev) => {
        const next = new Set(prev);
        if (!isCompleted) {
          day.readings.forEach((r) => next.add(`${r.book}_${r.chapter}`));
        } else {
          day.readings.forEach((r) => next.delete(`${r.book}_${r.chapter}`));
        }
        return next;
      });
    });

    try {
      const count = isCompleted ? 0 : null;
      await updateProgress(dayId, count);
    } catch (error) {
      throw error;
    }
  }, [updateProgress]);

  const toggleCompleteMany = useCallback(async (dayIds: number[], completed: boolean) => {
    if (dayIds.length === 0) return;

    // Defensively drop ids not present in the current plan so phantom days
    // never reach the optimistic update or the batch payload.
    const idSet = new Set(dayIds.filter((id) => planRef.current.some((d) => d.id === id)));
    if (idSet.size === 0) return;

    console.log('[PlanContext] toggleCompleteMany', { count: idSet.size, completed });

    const applyToDay = (d: ReadingPlanDay): ReadingPlanDay =>
      idSet.has(d.id)
        ? {
            ...d,
            completed,
            readCount: completed ? null : 0,
            items: d.items.map((item) => ({ ...item, completed })),
          }
        : d;

    planRef.current = planRef.current.map(applyToDay);
    const affectedDays = planRef.current.filter((d) => idSet.has(d.id));

    startTransition(() => {
      setPlan((prevPlan) => prevPlan.map(applyToDay));

      setReadChapters((prev) => {
        const next = new Set(prev);
        affectedDays.forEach((d) => {
          d.readings.forEach((r) => {
            const key = `${r.book}_${r.chapter}`;
            if (completed) next.add(key);
            else next.delete(key);
          });
        });
        return next;
      });
    });

    try {
      await graphqlClient.mutate(
        progressMutations.updateProgressBatch(Array.from(idSet), completed)
      );
    } catch (error) {
      console.error('[PlanContext] toggleCompleteMany failed', error);
      throw error;
    }
  }, []);

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
    toggleCompleteMany,
    setPlan,
    setReadChapters
  }), [plan, readChapters, loading, error, selectedDayId, isPending, fetchPlan, toggleItem, toggleComplete, toggleCompleteMany]);

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
