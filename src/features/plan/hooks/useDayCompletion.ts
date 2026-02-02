import { useState, useEffect, useRef } from 'react';
import { ReadingPlanDay } from '@/types';

const getCompletionMessage = (dayId: number): string => {
  return `🎉 Поздравляем! Вы завершили день ${dayId}! Вы молодец, продолжайте в том же духе!`;
};

export function useDayCompletion(
  day: ReadingPlanDay | null,
  options?: { isMissed?: boolean; todayDay?: ReadingPlanDay | null; alwaysShowIfCompleted?: boolean }
) {
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState<string>('');
  const prevDayCompletedRef = useRef<boolean>(false);
  const prevDayIdRef = useRef<number | null>(null);

  const alwaysShow = options?.alwaysShowIfCompleted ?? false;

  useEffect(() => {
    // Сбрасываем состояние при изменении дня
    if (day?.id !== prevDayIdRef.current) {
      // Если alwaysShow = true, мы всегда хотим увидеть модалку при первом появлении завершенного дня
      // Если alwaysShow = false (по умолчанию), мы инициализируем текущим состоянием завершенности,
      // чтобы модалка показывалась только при переходе false -> true
      prevDayCompletedRef.current = alwaysShow ? false : (day?.completed || false);
      prevDayIdRef.current = day?.id || null;
    }

    // Показываем поздравление при завершении дня
    if (day && day.completed && !prevDayCompletedRef.current && !showModal) {
      prevDayCompletedRef.current = true;
      setMessage(getCompletionMessage(day.id));
      setShowModal(true);
    } else if (day && !day.completed) {
      prevDayCompletedRef.current = false;
    } else if (!day) {
      // Сбрасываем состояние когда день становится null
      prevDayCompletedRef.current = false;
      prevDayIdRef.current = null;
    }
  }, [day?.completed, day?.id, showModal, alwaysShow]);

  const closeModal = () => {
    setShowModal(false);
  };

  return {
    showModal,
    message,
    closeModal
  };
}

