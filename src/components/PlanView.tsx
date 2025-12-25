'use client';

import React, { useState, useMemo } from 'react';
import { CheckCircle2, Circle, ChevronRight, ChevronDown, ChevronUp, Flame, User, Bell, BookOpen } from 'lucide-react';
import { ReadingPlanDay, BibleReference } from '@/types';
import { BIBLE_STRUCTURE } from '@/lib/constants';
import BibleProgress from './BibleProgress';

interface PlanViewProps {
  plan: ReadingPlanDay[];
  readChapters: Set<string>;
  onSelectReading: (day: ReadingPlanDay, reading: BibleReference) => void;
  onToggleComplete: (dayId: number) => void;
  onToggleChapter: (book: string, chapter: number) => void;
  userName?: string;
}

const PlanView: React.FC<PlanViewProps> = ({ 
  plan, 
  readChapters,
  onSelectReading, 
  onToggleComplete,
  onToggleChapter,
  userName = 'Пользователь'
}) => {
  const [showDetailedProgress, setShowDetailedProgress] = useState(false);
  const [visibleDays, setVisibleDays] = useState(20);
  const [isMissedExpanded, setIsMissedExpanded] = useState(true);
  const [isFullPlanExpanded, setIsFullPlanExpanded] = useState(false);
  const [expandedDayId, setExpandedDayId] = useState<number | null>(null);

  const filteredPlan = useMemo(() => plan.filter(d => d.id > 0), [plan]);

  // Categorize days
  const todayDay = useMemo(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const todayStr = `${day}.${month}.${year}`;
    
    const dayByDate = filteredPlan.find(d => d.dateStr === todayStr);
    if (dayByDate) return dayByDate;
    
    // Fallback if no exact date match
    return filteredPlan.find(d => !d.completed) || filteredPlan[filteredPlan.length - 1];
  }, [filteredPlan]);
  
  const missedDays = useMemo(() => {
    if (!todayDay) return [];
    return filteredPlan.filter(d => d.id < todayDay.id && !d.completed);
  }, [filteredPlan, todayDay]);

  // Calculate overall stats
  const stats = useMemo(() => {
    const totalChapters = BIBLE_STRUCTURE.reduce((acc, b) => acc + b.chapters, 0);
    const readCount = readChapters.size;
    const percentage = totalChapters > 0 ? Math.round((readCount / totalChapters) * 100) : 0;
    return { readCount, totalChapters, percentage };
  }, [readChapters]);

  const toggleDayExpand = (dayId: number) => {
    setExpandedDayId(expandedDayId === dayId ? null : dayId);
  };

  if (showDetailedProgress) {
    return (
      <BibleProgress 
        readChapters={readChapters} 
        onToggleChapter={onToggleChapter}
        onClose={() => setShowDetailedProgress(false)} 
      />
    );
  }

  const completedDaysCount = filteredPlan.filter(d => d.completed).length;
  const streak = completedDaysCount > 0 ? completedDaysCount : 0;
  
  const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const renderReadingItem = (day: ReadingPlanDay, reading: BibleReference, idx: number) => {
    const isRead = readChapters.has(`${reading.book}_${reading.chapter}`);
    return (
        <div key={`${day.id}-${idx}`} className="flex items-center py-2 group">
            <div 
                onClick={() => onToggleChapter(reading.book, reading.chapter)}
                className={`
                    w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 cursor-pointer transition-colors
                    ${isRead ? 'bg-red-500 border-red-500' : 'border-stone-200 hover:border-red-300'}
                `}
            >
                {isRead && <CheckCircle2 size={14} className="text-white" />}
            </div>
            <button
                onClick={() => onSelectReading(day, reading)}
                className="flex-1 flex justify-between items-center text-left"
            >
                <span className={`text-base font-medium ${isRead ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                    {reading.book} {reading.chapter}
                </span>
                <BookOpen size={16} className="text-stone-300 group-hover:text-red-400 transition-colors" />
            </button>
        </div>
    );
  };

  const renderDayCard = (day: ReadingPlanDay, isAlwaysExpanded = false) => {
    const isExpanded = isAlwaysExpanded || expandedDayId === day.id;
    const isCurrent = !day.completed && todayDay?.id === day.id;
    
    return (
        <div 
            key={day.id} 
            className={`bg-white rounded-2xl shadow-sm border transition-all duration-300 overflow-hidden ${
                isCurrent 
                    ? 'border-red-100 shadow-md ring-1 ring-red-50' 
                    : 'border-stone-100'
            }`}
        >
            {/* Card Header */}
            <div 
                className={`p-4 flex items-center justify-between cursor-pointer ${day.completed ? 'opacity-60 bg-stone-50' : ''}`}
                onClick={() => !isAlwaysExpanded && toggleDayExpand(day.id)}
            >
                <div className="flex items-center gap-4">
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(day.id);
                        }}
                        className={`
                            w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all active:scale-95
                            ${day.completed ? 'bg-green-100 text-green-700' : isCurrent ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-500'}
                            hover:ring-2 hover:ring-offset-2 ${day.completed ? 'hover:ring-green-200' : 'hover:ring-stone-200'}
                        `}
                    >
                        {day.completed ? <CheckCircle2 size={20} /> : day.id}
                    </button>
                    <div className="flex flex-col">
                        <span className={`font-bold ${day.completed ? 'text-stone-500 line-through' : 'text-stone-900'}`}>
                            День {day.id}
                        </span>
                        <span className="text-xs text-stone-400">
                            {day.readings.length} глав(ы)
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                     <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(day.id);
                        }}
                        className={`p-2 rounded-full transition-colors ${
                            day.completed ? 'text-green-500' : 'text-stone-200 hover:text-stone-300'
                        }`}
                    >
                        {day.completed ? <CheckCircle2 size={24} className="fill-current bg-white rounded-full" /> : <Circle size={24} />}
                    </button>
                    {!isAlwaysExpanded && (
                        <div className="text-stone-300">
                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className={`border-t border-stone-50 px-4 py-3 bg-white space-y-2 ${day.completed ? 'opacity-50' : ''}`}>
                    {day.readings.map((reading, idx) => renderReadingItem(day, reading, idx))}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-stone-100 overflow-y-auto pb-20">
      {/* Top App Bar */}
      <div className="bg-white px-5 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm border-b border-stone-100">
         <div className="flex items-center space-x-3">
             <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-500">
                 <User size={18} />
             </div>
             <span className="font-bold text-stone-800">Главная</span>
         </div>
         <div className="flex items-center space-x-4">
             <div className="flex items-center space-x-1 text-red-500 font-bold bg-red-50 px-2 py-1 rounded-full text-xs">
                 <Flame size={14} className="fill-current" />
                 <span>{streak}</span>
             </div>
             <Bell size={20} className="text-stone-400" />
         </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Header & Progress Card */}
        <div className="px-1 space-y-4">
            <div>
                <h1 className="text-3xl font-bold text-stone-900 capitalize">{date}</h1>
                <p className="text-stone-500 font-medium">Добрый день, {userName}</p>
            </div>

            {/* Clickable Progress Widget */}
            <button 
                onClick={() => setShowDetailedProgress(true)}
                className="w-full bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between group active:scale-[0.98] transition-all"
            >
                <div className="flex items-center gap-4">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                       <svg className="w-full h-full transform -rotate-90">
                           <circle cx="24" cy="24" r="20" stroke="#f3f4f6" strokeWidth="4" fill="none" />
                           <circle 
                             cx="24" cy="24" r="20" 
                             stroke={stats.percentage === 100 ? '#22c55e' : '#ef4444'} 
                             strokeWidth="4" 
                             fill="none" 
                             strokeDasharray="126"
                             strokeDashoffset={126 - (126 * stats.percentage) / 100}
                             strokeLinecap="round"
                           />
                       </svg>
                       <span className="absolute text-[10px] font-bold text-stone-800">{stats.percentage}%</span>
                   </div>
                   <div className="text-left">
                       <div className="font-bold text-stone-900">Прогресс Библии</div>
                       <div className="text-xs text-stone-500">{stats.readCount} из {stats.totalChapters} глав</div>
                   </div>
                </div>
                <ChevronRight size={20} className="text-stone-300 group-hover:text-stone-500" />
            </button>
        </div>

        {/* Verse of the Day Card */}
        <div className="bg-stone-900 rounded-2xl p-6 text-white relative overflow-hidden group cursor-pointer shadow-lg transition-shadow">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10">
                <div className="text-xs font-bold tracking-widest text-stone-400 uppercase mb-3">Стих дня</div>
                <p className="font-serif text-lg leading-relaxed mb-4">
                    "Все Писание богодухновенно и полезно для научения, для обличения, для исправления, для наставления в праведности"
                </p>
                <div className="flex justify-between items-end">
                    <span className="text-sm font-medium text-stone-300">2-е Тимофею 3:16</span>
                    <button className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                        <ChevronRight size={20} className="text-white" />
                    </button>
                </div>
            </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
            
            {/* 1. Reading Today */}
            {todayDay && (
                <div className="space-y-3">
                    <h2 className="text-lg font-bold text-stone-800 px-1">Читаем сегодня</h2>
                    {renderDayCard(todayDay, true)}
                </div>
            )}

            {/* 2. Missed Days Accordion */}
            {missedDays.length > 0 && (
                <div className="space-y-2">
                    <button 
                        onClick={() => setIsMissedExpanded(!isMissedExpanded)}
                        className="flex items-center justify-between w-full px-1 group"
                    >
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-red-600">Пропущенные дни</h2>
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                {missedDays.length}
                            </span>
                        </div>
                        {isMissedExpanded ? <ChevronUp size={20} className="text-stone-400" /> : <ChevronDown size={20} className="text-stone-400" />}
                    </button>
                    
                    {isMissedExpanded && (
                        <div className="space-y-3">
                            {missedDays.map(day => renderDayCard(day))}
                        </div>
                    )}
                </div>
            )}

            {/* 3. Full Plan Accordion */}
            <div className="space-y-2">
                <button 
                    onClick={() => setIsFullPlanExpanded(!isFullPlanExpanded)}
                    className="flex items-center justify-between w-full px-1 group"
                >
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-stone-800">Весь план</h2>
                        <span className="text-stone-400 text-sm font-medium">
                            {completedDaysCount} из {filteredPlan.length} дней
                        </span>
                    </div>
                    {isFullPlanExpanded ? <ChevronUp size={20} className="text-stone-400" /> : <ChevronDown size={20} className="text-stone-400" />}
                </button>
                
                {isFullPlanExpanded && (
                    <div className="space-y-3">
                        {filteredPlan.slice(0, visibleDays).map(day => renderDayCard(day))}
                        
                        {visibleDays < filteredPlan.length && (
                            <button 
                                onClick={() => setVisibleDays(prev => prev + 20)}
                                className="w-full py-4 bg-white rounded-2xl border border-stone-100 text-stone-500 font-bold text-sm hover:bg-stone-50 transition-colors"
                            >
                                Показать еще
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default PlanView;
