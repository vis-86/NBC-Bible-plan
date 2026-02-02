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

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = 'max-h-[80vh]',
  disableOverlay = false
}) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setDragY(0);
      setIsDragging(false);
      touchStartY.current = null;
    }
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Начинаем отслеживание только если касание началось в области handle bar или header
    const target = e.target as HTMLElement;
    const isHandleArea = target.closest('.handle-area') || target.closest('.sheet-header');
    
    if (isHandleArea) {
      touchStartY.current = e.touches[0].clientY;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || touchStartY.current === null) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    // Разрешаем только свайп вниз
    if (deltaY > 0) {
      setDragY(deltaY);
      e.preventDefault(); // Предотвращаем скролл страницы
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;

    const threshold = 100; // Минимальное расстояние для закрытия
    
    if (dragY > threshold) {
      onClose();
    } else {
      // Возвращаем на место с анимацией
      setDragY(0);
    }

    setIsDragging(false);
    touchStartY.current = null;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      {!disableOverlay && (
        <div 
          className="fixed inset-0 z-[60] bg-black/20 transition-opacity"
          onClick={onClose}
        />
      )}
      
      {/* Bottom Sheet */}
      <div 
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-[70] bg-white rounded-t-3xl shadow-2xl ${maxHeight} overflow-hidden flex flex-col ${
          isDragging ? '' : 'animate-slide-up'
        }`}
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar */}
        <div 
          className="handle-area flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="w-12 h-1 bg-stone-300 rounded-full" />
        </div>

        {/* Header */}
        {title && (
          <div 
            className="sheet-header px-6 py-2.5 border-b border-stone-100 flex items-center justify-between"
            style={{ pointerEvents: 'auto' }}
          >
            {typeof title === 'string' ? (
              <h2 className="text-lg font-bold text-stone-900">{title}</h2>
            ) : (
              <div className="flex-1">{title}</div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-900 active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content */}
        <div 
          className="flex-1 overflow-y-auto px-6 py-3"
          style={{ pointerEvents: 'auto' }}
        >
          {children}
        </div>
      </div>
    </>
  );
};

