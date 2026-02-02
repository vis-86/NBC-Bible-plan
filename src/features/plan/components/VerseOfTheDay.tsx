'use client';

import React from 'react';

export const VerseOfTheDay: React.FC = () => {
  return (
    <div className="card-apple-dark p-6 relative overflow-hidden group cursor-pointer transition-shadow">
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
      <div className="relative">
        <p className="font-serif text-lg leading-relaxed mb-4">
          "Все Писание богодухновенно и полезно для научения, для обличения, для исправления, для наставления в праведности"
        </p>
        <div className="flex justify-between items-end">
          <span className="text-sm font-medium text-stone-300">2-е Тимофею 3:16</span>
        </div>
      </div>
    </div>
  );
};

