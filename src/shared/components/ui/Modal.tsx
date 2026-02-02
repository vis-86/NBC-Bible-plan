'use client';

import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md'
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-white rounded-3xl shadow-2xl ${maxWidth} w-full p-8 relative animate-scale-in`}>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-900 active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>

          {/* Title */}
          {title && (
            <h2 className="text-2xl font-bold text-stone-900 mb-4">
              {title}
            </h2>
          )}

          {/* Content */}
          {children}
        </div>
      </div>
    </>
  );
};

