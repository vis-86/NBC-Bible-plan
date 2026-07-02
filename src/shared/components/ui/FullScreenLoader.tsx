import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface FullScreenLoaderProps {
  /** Optional caption shown under the spinner. */
  label?: string;
}

/**
 * Full-viewport branded loader on the themed background. Used as the app-shell
 * splash while the client boots / auth resolves — keeps cold PWA launches from
 * showing a bare white screen.
 */
export const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({ label = 'Загрузка…' }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-app-bg">
      <LoadingSpinner size={32} />
      <p className="text-sm text-app-text-muted">{label}</p>
    </div>
  );
};
