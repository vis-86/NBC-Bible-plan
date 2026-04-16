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
      <div className="bg-app-missed border border-app-missed-text/20 rounded-lg p-6 max-w-md">
        <h3 className="text-app-accent font-bold mb-2">{title}</h3>
        <p className="text-app-accent/80 mb-4">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-app-accent text-app-text-inverse rounded-md hover:opacity-90 transition-opacity"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
};

