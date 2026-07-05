'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
  disableOverlay?: boolean; // Отключает overlay для возможности взаимодействия с контентом под ним
}

const LOG_FIX = process.env.DEBUG_FIX === '1' || process.env.NODE_ENV === 'development';

/**
 * Ренерится только при открытом шите: при закрытии размонтируется — состояние drag сбрасывается
 * без useEffect + setState (eslint react-hooks/set-state-in-effect).
 */
const BottomSheetOpenContent: React.FC<
  Omit<BottomSheetProps, 'isOpen'>
// dvh, не vh: в Safari с видимым URL-баром 1vh больше видимой области —
// прибитый к bottom-0 шит с max-h в vh вылезал бы верхом за экран.
> = ({ onClose, title, children, maxHeight = 'max-h-[80dvh]', disableOverlay = false }) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (LOG_FIX) {
      console.debug('[FIX] BottomSheet inner mounted', { maxHeight, disableOverlay });
    }
  }, [maxHeight, disableOverlay]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || touchStartY.current === null) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    if (deltaY > 0) {
      setDragY(deltaY);
      e.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    const threshold = 100;

    if (dragY > threshold) {
      if (LOG_FIX) {
        console.debug('[FIX] BottomSheet drag dismissed', { dragY, threshold });
      }
      onClose();
    } else {
      setDragY(0);
    }

    setIsDragging(false);
    touchStartY.current = null;
  };

  const dragHandlers = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd
  };

  return (
    <>
      {!disableOverlay && (
        <div
          data-bottom-sheet-overlay
          className="fixed inset-0 z-[60] bg-black/20 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Внешний слой: только transform для drag. Иначе iOS/WebKit часто ломает scroll внутри transformed flex. */}
      <div
        data-bottom-sheet
        className={`fixed bottom-0 left-0 right-0 z-[70] ${isDragging ? '' : 'animate-slide-up'}`}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
          pointerEvents: disableOverlay ? 'none' : 'auto'
        }}
        onClick={(e) => {
          if (!disableOverlay) {
            e.stopPropagation();
          }
        }}
      >
        <div
          data-bottom-sheet-panel
          // pointer-events-auto: когда disableOverlay=true, контейнер выше имеет
          // pointerEvents:none (чтобы тапы проходили к календарю сквозь пустую
          // область над панелью). Без этого сама панель и её кнопки — включая
          // крестик закрытия — тоже становятся некликабельными.
          className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-3xl bg-app-surface shadow-app-lg ${maxHeight}`}
        >
          <div
            data-bottom-sheet-handle
            className="handle-area flex cursor-grab justify-center pt-3 pb-2 active:cursor-grabbing"
            {...dragHandlers}
          >
            <div className="h-1 w-12 rounded-full bg-app-border" />
          </div>

          {title && (
            <div
              data-bottom-sheet-header
              className="sheet-header flex items-center justify-between border-b border-app-border px-6 py-2.5"
              {...dragHandlers}
            >
              {typeof title === 'string' ? (
                <h2 className="text-lg font-bold text-app-text">{title}</h2>
              ) : (
                <div className="flex-1">{title}</div>
              )}
              <button
                type="button"
                data-bottom-sheet-close-button
                onClick={onClose}
                // На тач-устройствах закрываем на touchend и гасим событие:
                // preventDefault убирает синтетический "ghost click", который
                // иначе прилетает на элемент под шитом (день календаря) уже после
                // закрытия и переоткрывает панель. stopPropagation — чтобы не
                // триггерить drag-хендлеры шапки.
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 text-app-text-muted transition-transform hover:text-app-text active:scale-90"
              >
                <X size={18} />
              </button>
            </div>
          )}

          <div
            data-bottom-sheet-body
            // pb: контент (в т.ч. кнопки действий, как «Продолжить» в
            // CompletionModal) не должен прятаться под home-indicator/нижним
            // баром iPhone — панель прибита к bottom-0 без собственного отступа.
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]"
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, ...openProps }) => {
  if (!isOpen) {
    return null;
  }

  return <BottomSheetOpenContent {...openProps} />;
};
