'use client';

import React from 'react';
import { BookOpen, Home, MessageCircle, Search } from 'lucide-react';
import { AppView } from '@/types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  currentView: AppView;
  onChangeView: (view: AppView) => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, currentView, onChangeView }) => {
  const navItems = [
    { view: AppView.PLAN, icon: Home, label: 'Главная' },
    { view: AppView.READER, icon: BookOpen, label: 'Библия' },
    { view: AppView.CHAT, icon: MessageCircle, label: 'Пастырь' },
    { view: AppView.REFERENCE, icon: Search, label: 'Поиск' },
  ];

  return (
    <div className="flex flex-col h-screen bg-stone-100 text-stone-900 font-sans overflow-hidden">
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative w-full">
        <div 
          key={currentView} 
          className="max-w-md mx-auto h-full bg-stone-50 md:shadow-xl"
        >
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 bg-white border-t border-stone-200 safe-area-bottom z-50">
        <div className="max-w-md mx-auto flex justify-between items-center h-[60px] px-6">
          {navItems.map((item) => (
            <button
              key={item.view}
              onClick={() => onChangeView(item.view)}
              className={`flex flex-col items-center justify-center space-y-1 transition-all duration-200 active:scale-95 ${
                currentView === item.view ? 'text-red-600' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <item.icon 
                size={24} 
                strokeWidth={currentView === item.view ? 2.5 : 2} 
                className={currentView === item.view ? 'fill-current opacity-10' : ''}
              />
              <span className={`text-[10px] font-medium ${currentView === item.view ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default DashboardLayout;
