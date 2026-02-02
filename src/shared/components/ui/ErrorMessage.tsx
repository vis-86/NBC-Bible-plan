'use client';

import React from 'react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = 'Ошибка',
  message,
  onRetry,
  retryLabel = 'Попробовать снова'
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
        <h3 className="text-red-800 font-bold mb-2">{title}</h3>
        <p className="text-red-600 mb-4">{message}</p>
        {onRetry && (
          <button 
            onClick={onRetry}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
};

