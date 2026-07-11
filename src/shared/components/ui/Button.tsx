'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = 'font-medium rounded-full transition-transform duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg';

  const variantStyles = {
    primary: 'bg-app-primary text-app-text-inverse hover:opacity-90 shadow-app-sm',
    secondary: 'bg-app-surface-muted text-app-text-secondary hover:bg-app-surface-elevated',
    ghost: 'bg-transparent text-app-text-secondary hover:bg-app-surface-muted',
    // Чёрная первичная CTA эталона «Sacred Minimal»: тёмный фон + инверсный текст.
    inverse: 'bg-app-text text-app-text-inverse hover:opacity-90 shadow-app-sm',
    danger: 'border-2 border-app-missed-text bg-transparent text-app-missed-text hover:bg-app-missed',
  };

  // min-h 44px (Fitts) on md/lg — sm stays compact for dense inline contexts.
  const sizeStyles = {
    sm: 'px-4 py-2 text-sm min-h-9',
    md: 'px-6 py-3 text-base min-h-11',
    lg: 'px-8 py-4 text-lg min-h-11',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

