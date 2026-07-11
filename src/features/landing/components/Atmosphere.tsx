'use client';

import React from 'react';

/**
 * Декоративный фон лендинга: чистая «бумага» (`--app-bg`) с единственным
 * едва заметным свечением сверху (primary-muted). Никаких текстур и зерна —
 * спокойный фон в духе apple.com; светлая/тёмная тема — автоматически через токены.
 */
export const Atmosphere: React.FC = () => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 z-0 opacity-60"
    style={{
      background:
        'radial-gradient(90% 55% at 50% -12%, var(--app-primary-muted), transparent 70%)',
    }}
  />
);
