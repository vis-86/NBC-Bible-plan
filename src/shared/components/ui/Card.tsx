'use client';

import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** surface: flat background separated by tone; elevated: adds a soft shadow lift. */
  variant?: 'surface' | 'elevated';
  children: React.ReactNode;
}

/**
 * Base card surface: separates content by background tone rather than a hard
 * border (AI-slop `border-gray-*` outlines) and uses the --radius-card token.
 */
export const Card: React.FC<CardProps> = ({
  variant = 'surface',
  children,
  className = '',
  ...props
}) => {
  const variantStyles = {
    surface: 'bg-app-surface',
    elevated: 'bg-app-surface shadow-app-card',
  };

  return (
    <div
      className={`rounded-app-card ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
