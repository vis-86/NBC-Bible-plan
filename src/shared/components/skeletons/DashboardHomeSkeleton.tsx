'use client';

import React from 'react';

type SkeletonBlockProps = {
  className?: string;
};

function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      className={[
        'bg-stone-200/70',
        'rounded-lg',
        'animate-pulse',
        className ?? '',
      ].join(' ')}
      aria-hidden="true"
    />
  );
}

export default function DashboardHomeSkeleton() {
  return (
    <div className="flex flex-col h-full bg-[rgb(245,245,247)] overflow-y-auto pb-20">
      {/* Top App Bar (matches PlanView sticky header footprint) */}
      <div className="bg-white/75 backdrop-blur-xl sticky top-0 z-10 border-b border-black/5">
        <div className="px-5 py-2 h-[64px] flex items-center justify-between">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-44 rounded-md" />
            <SkeletonBlock className="h-3 w-56 rounded-md" />
          </div>
          <SkeletonBlock className="h-7 w-14 rounded-full" />
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Weekly Plan section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 h-8">
            <SkeletonBlock className="h-4 w-48 rounded-md" />
            <SkeletonBlock className="h-4 w-20 rounded-md" />
          </div>
          {/* Carousel/card placeholder */}
          <SkeletonBlock className="h-[140px] w-full rounded-2xl" />
        </div>

        {/* Day Navigation Bar section (header + cubes row) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 h-8">
            <SkeletonBlock className="h-4 w-44 rounded-md" />
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
          </div>

          <div className="w-full overflow-hidden">
            <div className="flex gap-2">
              {Array.from({ length: 5 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="w-16 h-16 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Selected day card (header + a few rows + footer button) */}
          <div className="card-apple overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <div className="flex items-center justify-between gap-4">
                <SkeletonBlock className="h-5 w-40 rounded-md" />
                <SkeletonBlock className="h-7 w-28 rounded-full" />
              </div>
            </div>

            <div className="px-4 py-4 space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-12 w-full rounded-2xl" />
              ))}
            </div>

            <div className="px-4 py-4 border-t border-black/5">
              <SkeletonBlock className="h-14 w-full rounded-2xl" />
            </div>
          </div>
        </div>

        {/* Progress widget */}
        <div className="px-1 space-y-4">
          <SkeletonBlock className="h-[84px] w-full rounded-3xl" />
        </div>

        {/* Verse of the day */}
        <div className="mt-8">
          <SkeletonBlock className="h-[160px] w-full rounded-3xl bg-stone-800/15" />
        </div>
      </div>
    </div>
  );
}

