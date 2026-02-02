'use client';

import React, { useEffect, useState } from 'react';
import { X, Undo2, Check } from 'lucide-react';

interface ToastProps {
  isOpen: boolean;
  onClose: () => void;
  onUndo: () => void;
  message: string;
  duration?: number; // в секундах
}

export const Toast: React.FC<ToastProps> = ({
  isOpen,
  onClose,
  onUndo,
  message,
  duration = 5
}) => {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(duration);
      return;
    }

    // Используем более частый интервал для плавной анимации (50ms)
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // прошедшее время в секундах
      const newValue = Math.max(0, duration - elapsed);
      
      if (newValue <= 0) {
        clearInterval(interval);
        // Даем время для завершения анимации прогресс-бара перед закрытием
        setTimeout(() => {
          onClose();
        }, 100);
        setTimeLeft(0);
      } else {
        setTimeLeft(newValue);
      }
    }, 50); // Обновляем каждые 50ms для плавной анимации

    return () => clearInterval(interval);
  }, [isOpen, duration, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[80]">
      <div className="bg-green-600 text-white rounded-lg shadow-2xl px-6 py-4 min-w-[400px] max-w-[90vw] animate-slide-up relative overflow-hidden">
        {/* Progress indicator as bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-700">
          <div
            className="h-full bg-white transition-all duration-50 ease-linear"
            style={{ width: `${Math.max(0, (timeLeft / duration) * 100)}%` }}
          />
        </div>
        
        <div className="flex items-start gap-3">
          {/* Check Icon */}
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
              <Check size={14} strokeWidth={3} className="text-white" />
            </div>
          </div>
          
          <div className="flex-1">
            <p className="text-sm font-medium">{message}</p>
          </div>
          
          <button
            onClick={onClose}
            className="p-1 hover:bg-green-700 rounded transition-colors active:scale-95 flex-shrink-0"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="mt-3 pt-1">
          <button
            onClick={onUndo}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors active:scale-95 text-sm font-medium"
          >
            <Undo2 size={16} />
            <span>Отменить действие</span>
          </button>
        </div>
      </div>
    </div>
  );
};
