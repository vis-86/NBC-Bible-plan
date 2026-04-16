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
        <div className={`bg-app-surface rounded-3xl shadow-app-lg ${maxWidth} w-full p-8 relative animate-scale-in`}>
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-app-text-muted hover:text-app-text active:scale-90 transition-transform"
          >
            <X size={20} />
          </button>

          {/* Title */}
          {title && (
            <h2 className="text-2xl font-bold text-app-text mb-4">
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

