'use client';

import React from 'react';

/**
 * Декоративный фон лендинга в стиле «Sacred Minimal»: тёплая бумага (`--app-bg`)
 * + мягкие радиальные свечения (золото + индиго + emerald) и тонкое зерно.
 * Чисто презентационный слой — `aria-hidden`, не перехватывает события.
 */
export const Atmosphere: React.FC = () => (
  <>
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        background:
          'radial-gradient(60% 50% at 78% 18%, rgba(199,154,75,0.18), transparent 60%),' +
          'radial-gradient(55% 55% at 12% 88%, rgba(79,70,229,0.10), transparent 60%),' +
          'radial-gradient(40% 40% at 90% 90%, rgba(16,185,129,0.06), transparent 60%)',
      }}
    />
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[1] opacity-40 [mix-blend-mode:multiply]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
      }}
    />
  </>
);
